// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title ConsultationBooking
/// @notice USDC escrow for patient-funded online consultations with approved doctors.
/// @dev Amounts are raw six-decimal USDC units (1 USDC = 1_000_000 units).
/// The deployer must supply the intended network's genuine USDC token address.
/// Only new bookings are paused. Existing bookings retain all settlement paths.
/// Bookings reserve every covered 15-minute bucket. Patients may cancel before
/// startTime; doctors may cancel while Booked. A doctor submits completion only
/// after the appointment ends and before startTime + 48 hours. A still-Booked
/// appointment is fully refundable to its patient at startTime + 48 hours.
/// CompletionSubmitted pays out on patient confirmation, or permissionless
/// finalization after 24 hours without dispute. Before that deadline the patient
/// may dispute. The owner resolves Disputed escrow with a patient/doctor split;
/// after 14 unresolved days the patient may instead reclaim the full escrow.
/// Platform fees apply only to the doctor portion. Full refunds release buckets;
/// completed and partially paid resolutions retain their occupied buckets.
/// Completion and dispute payouts, and doctor-initiated refunds, accrue as pull
/// payments. Recipients withdraw separately so USDC recipient restrictions cannot
/// block those settlements. Patient-initiated refunds transfer directly to the caller.
/// Addresses, schedules, profiles, and hashes are public; never put medical notes
/// in profiles or metadata URIs. Hash notes offchain with a high-entropy secret salt;
/// a hash alone does not provide confidentiality for guessable medical information.
contract ConsultationBooking is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant MAX_PLATFORM_FEE_BPS = 1_000;
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant MIN_BOOKING_NOTICE = 1 hours;
    uint256 public constant COMPLETION_WINDOW = 48 hours;
    uint256 public constant DISPUTE_WINDOW = 24 hours;
    uint256 public constant DISPUTE_RESOLUTION_TIMEOUT = 14 days;

    IERC20 public immutable usdc;
    address public immutable treasury;
    uint16 public immutable platformFeeBps;

    enum Status { Booked, CompletionSubmitted, Completed, Cancelled, Refunded, Disputed, Resolved }

    struct Doctor {
        address doctor;
        string name;
        string specialty;
        uint256 feeUsdc;
        string metadataURI;
        bool approved;
        bool active;
    }

    struct Booking {
        uint256 id;
        address patient;
        address doctor;
        uint64 startTime;
        uint32 durationMins;
        bytes32 noteHash;
        uint256 feeUsdc;
        Status status;
        uint64 submittedAt;
        uint64 disputedAt;
    }

    /// @notice Total bookings ever created; valid IDs start at one.
    uint256 public bookingCount;
    mapping(address => Doctor) private _doctors;
    address[] private _doctorAddresses;
    mapping(uint256 => Booking) private _bookings;
    mapping(address => uint256[]) private _patientBookings;
    mapping(address => uint256[]) private _doctorBookings;
    mapping(address => mapping(uint256 => bool)) private _slots;

    /// @notice Accrued USDC payouts available for each account to withdraw.
    mapping(address => uint256) public claimable;

    error ZeroAddress();
    error InvalidTreasury();
    error InvalidDoctor();
    error InvalidFee();
    error PlatformFeeTooHigh(uint16 supplied);
    error DoctorAlreadyApproved(address doctor);
    error DoctorNotApproved(address doctor);
    error DoctorInactive(address doctor);
    error InvalidDuration();
    error InsufficientBookingNotice();
    error SlotAlreadyTaken(address doctor, uint64 startTime);
    error BookingNotFound(uint256 id);
    error BookingNotOpen(uint256 id);
    error UnauthorizedBookingActor();
    error AppointmentAlreadyStarted();
    error ConsultationNotEnded();
    error CompletionDeadlinePassed();
    error RefundNotAvailableYet();
    error FeeAboveMax(uint256 fee, uint256 maxFeeUsdc);
    error InvalidStartTime();
    error CompletionNotSubmitted(uint256 id);
    error BookingNotDisputed(uint256 id);
    error DisputeDeadlinePassed();
    error DisputeWindowNotElapsed();
    error InvalidPatientShare();
    error OwnershipRenunciationDisabled();
    error NothingToWithdraw();

    event DoctorAdded(address indexed doctor, string name, string specialty, uint256 feeUsdc, string metadataURI);
    event DoctorRemoved(address indexed doctor);
    event DoctorUpdated(address indexed doctor, string name, string specialty, uint256 feeUsdc, string metadataURI, bool active);
    event ConsultationBooked(
        uint256 indexed id,
        address indexed patient,
        address indexed doctor,
        uint64 startTime,
        uint32 durationMins,
        bytes32 noteHash,
        uint256 feeUsdc
    );
    event Withdrawn(address indexed account, uint256 amount);
    event ConsultationCancelled(uint256 indexed id, address indexed cancelledBy, address indexed patient, uint256 refundUsdc);
    event ConsultationCompleted(uint256 indexed id, address indexed doctor, uint256 doctorPaymentUsdc, uint256 platformPaymentUsdc);
    event ConsultationRefunded(uint256 indexed id, address indexed patient, uint256 refundUsdc);
    event ConsultationCompletionSubmitted(uint256 indexed id, address indexed doctor, uint64 submittedAt);
    event ConsultationDisputed(uint256 indexed id, address indexed patient, uint64 disputedAt);
    event ConsultationResolved(
        uint256 indexed id,
        address indexed patient,
        address indexed doctor,
        uint256 patientPaymentUsdc,
        uint256 doctorPaymentUsdc,
        uint256 platformPaymentUsdc
    );

    /// @notice Set permanent settlement terms and the initial two-step administrator.
    /// @param usdc_ Genuine USDC ERC-20 address on the deployment network.
    /// @param admin Initial owner who manages approvals and booking pauses.
    /// @param treasury_ Recipient of platform fees; cannot be this escrow.
    /// @param platformFeeBps_ Platform fee in basis points, capped at 1,000 (10%).
    constructor(address usdc_, address admin, address treasury_, uint16 platformFeeBps_) Ownable(admin) {
        if (usdc_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        if (treasury_ == address(this)) revert InvalidTreasury();
        if (platformFeeBps_ > MAX_PLATFORM_FEE_BPS) revert PlatformFeeTooHigh(platformFeeBps_);
        usdc = IERC20(usdc_);
        treasury = treasury_;
        platformFeeBps = platformFeeBps_;
    }

    /// @notice Approve a new doctor or reapprove a previously removed doctor.
    /// @dev Reapproval replaces the profile and enables bookings without duplicating the directory entry.
    function addDoctor(
        address doctor,
        string calldata name,
        string calldata specialty,
        uint256 feeUsdc,
        string calldata metadataURI
    ) external onlyOwner {
        if (doctor == address(0)) revert ZeroAddress();
        if (doctor == address(this)) revert InvalidDoctor();
        if (feeUsdc == 0) revert InvalidFee();
        Doctor storage profile = _doctors[doctor];
        if (profile.approved) revert DoctorAlreadyApproved(doctor);
        if (profile.doctor == address(0)) _doctorAddresses.push(doctor);
        _doctors[doctor] = Doctor(doctor, name, specialty, feeUsdc, metadataURI, true, true);
        emit DoctorAdded(doctor, name, specialty, feeUsdc, metadataURI);
    }

    /// @notice Disable a doctor's future bookings without affecting existing obligations.
    function removeDoctor(address doctor) external onlyOwner {
        Doctor storage profile = _doctors[doctor];
        if (!profile.approved) revert DoctorNotApproved(doctor);
        profile.approved = false;
        profile.active = false;
        emit DoctorRemoved(doctor);
    }

    /// @notice Update the caller's approved profile and availability for future bookings.
    /// @dev Existing bookings retain their original fee and assigned doctor.
    function updateDoctor(
        string calldata name,
        string calldata specialty,
        uint256 feeUsdc,
        string calldata metadataURI,
        bool active
    ) external {
        Doctor storage profile = _doctors[msg.sender];
        if (!profile.approved) revert DoctorNotApproved(msg.sender);
        if (feeUsdc == 0) revert InvalidFee();
        profile.name = name;
        profile.specialty = specialty;
        profile.feeUsdc = feeUsdc;
        profile.metadataURI = metadataURI;
        profile.active = active;
        emit DoctorUpdated(msg.sender, name, specialty, feeUsdc, metadataURI, active);
    }

    /// @notice Return every registered doctor, including inactive and removed entries.
    /// @dev Frontends should filter on both approved and active to offer new bookings.
    function getDoctors() external view returns (Doctor[] memory doctors) {
        uint256 length = _doctorAddresses.length;
        doctors = new Doctor[](length);
        for (uint256 i; i < length; ++i) {
            doctors[i] = _doctors[_doctorAddresses[i]];
        }
    }

    /// @notice Book as msg.sender using a prior USDC allowance for the doctor's current fee.
    /// @dev Reserves all covered 15-minute buckets; the payment fee is snapshotted.
    /// Duration must be a multiple of 15 minutes, from 15 through 240 inclusive.
    /// @param noteHash Salted offchain note commitment; no plaintext notes are accepted.
    /// @param maxFeeUsdc Maximum acceptable fee, protecting against intervening price changes.
    /// @return id Newly assigned one-based booking ID.
    function bookConsultation(
        address doctor,
        uint64 startTime,
        uint32 durationMins,
        bytes32 noteHash,
        uint256 maxFeeUsdc
    ) external nonReentrant whenNotPaused returns (uint256 id) {
        Doctor storage profile = _doctors[doctor];
        if (!profile.approved) revert DoctorNotApproved(doctor);
        if (!profile.active) revert DoctorInactive(doctor);
        if (durationMins < 15 || durationMins > 240 || durationMins % 15 != 0) revert InvalidDuration();
        if (startTime % 900 != 0) revert InvalidStartTime();
        if (uint256(startTime) < block.timestamp + MIN_BOOKING_NOTICE) revert InsufficientBookingNotice();

        uint256 fee = profile.feeUsdc;
        if (fee > maxFeeUsdc) revert FeeAboveMax(fee, maxFeeUsdc);
        uint256 firstBucket = uint256(startTime) / 900;
        uint256 bucketCount = uint256(durationMins) / 15;
        for (uint256 i; i < bucketCount; ++i) {
            if (_slots[doctor][firstBucket + i]) revert SlotAlreadyTaken(doctor, startTime);
            _slots[doctor][firstBucket + i] = true;
        }
        id = ++bookingCount;
        _bookings[id] = Booking(id, msg.sender, doctor, startTime, durationMins, noteHash, fee, Status.Booked, 0, 0);
        _patientBookings[msg.sender].push(id);
        _doctorBookings[doctor].push(id);
        usdc.safeTransferFrom(msg.sender, address(this), fee);
        emit ConsultationBooked(id, msg.sender, doctor, startTime, durationMins, noteHash, fee);
    }

    /// @notice Cancel and refund the full escrow to the original patient.
    /// @dev The assigned doctor may cancel any open booking, even after removal or
    /// startTime, crediting the patient's claimable balance without a token transfer.
    /// A patient (not also the doctor) may cancel strictly before startTime for a direct refund.
    /// Cancellation releases the slot. This function remains available while paused.
    function cancelConsultation(uint256 id) external nonReentrant {
        Booking storage booking = _openBooking(id);
        if (msg.sender != booking.doctor) {
            if (msg.sender != booking.patient) revert UnauthorizedBookingActor();
            if (block.timestamp >= uint256(booking.startTime)) revert AppointmentAlreadyStarted();
        }
        booking.status = Status.Cancelled;
        _releaseSlots(booking);
        if (msg.sender == booking.doctor) {
            claimable[booking.patient] += booking.feeUsdc;
        } else {
            usdc.safeTransfer(booking.patient, booking.feeUsdc);
        }
        emit ConsultationCancelled(id, msg.sender, booking.patient, booking.feeUsdc);
    }

    /// @notice Assigned doctor submits completion without releasing escrow.
    /// @dev Allowed at or after the appointment ends, strictly before startTime + 48 hours.
    /// Removal/inactivity and pauses do not affect settlement.
    function submitCompletion(uint256 id) external nonReentrant {
        Booking storage booking = _openBooking(id);
        if (msg.sender != booking.doctor) revert UnauthorizedBookingActor();
        if (block.timestamp < uint256(booking.startTime) + uint256(booking.durationMins) * 60) {
            revert ConsultationNotEnded();
        }
        if (block.timestamp >= uint256(booking.startTime) + COMPLETION_WINDOW) revert CompletionDeadlinePassed();
        booking.status = Status.CompletionSubmitted;
        booking.submittedAt = uint64(block.timestamp);
        emit ConsultationCompletionSubmitted(id, booking.doctor, booking.submittedAt);
    }

    /// @notice Patient accepts submitted completion and credits payouts for withdrawal.
    /// @dev Available any time while CompletionSubmitted, including after the dispute window.
    /// No USDC transfer occurs during completion; recipient restrictions cannot block it.
    function confirmCompletion(uint256 id) external nonReentrant {
        Booking storage booking = _submittedBooking(id);
        if (msg.sender != booking.patient) revert UnauthorizedBookingActor();
        _completeBooking(booking);
    }

    /// @notice Patient disputes submitted completion before the 24-hour deadline.
    /// @dev At the exact deadline disputes close and permissionless finalization opens.
    function disputeCompletion(uint256 id) external nonReentrant {
        Booking storage booking = _submittedBooking(id);
        if (msg.sender != booking.patient) revert UnauthorizedBookingActor();
        if (block.timestamp >= uint256(booking.submittedAt) + DISPUTE_WINDOW) revert DisputeDeadlinePassed();
        booking.status = Status.Disputed;
        booking.disputedAt = uint64(block.timestamp);
        emit ConsultationDisputed(id, booking.patient, booking.disputedAt);
    }

    /// @notice Anyone may settle an undisputed submission once its dispute window elapses.
    /// @dev Credits doctor and treasury balances for withdrawal without transferring USDC.
    function finalizeCompletion(uint256 id) external nonReentrant {
        Booking storage booking = _submittedBooking(id);
        if (block.timestamp < uint256(booking.submittedAt) + DISPUTE_WINDOW) revert DisputeWindowNotElapsed();
        _completeBooking(booking);
    }

    /// @notice Owner resolves a dispute by splitting escrow between patient and doctor.
    /// @dev Patient share rounds down. Platform fees are charged only on the remainder
    /// allocated to the doctor; a 100% patient refund has no platform fee and releases slots.
    /// All shares credit claimable balances; recipient restrictions cannot block resolution.
    function resolveDispute(uint256 id, uint16 patientShareBps) external onlyOwner nonReentrant {
        Booking storage booking = _disputedBooking(id);
        if (patientShareBps > BPS_DENOMINATOR) revert InvalidPatientShare();
        uint256 patientPayment = Math.mulDiv(booking.feeUsdc, patientShareBps, BPS_DENOMINATOR);
        uint256 doctorPortion = booking.feeUsdc - patientPayment;
        uint256 platformPayment = Math.mulDiv(doctorPortion, platformFeeBps, BPS_DENOMINATOR);
        uint256 doctorPayment = doctorPortion - platformPayment;
        booking.status = Status.Resolved;
        if (patientShareBps == BPS_DENOMINATOR) _releaseSlots(booking);
        if (patientPayment != 0) claimable[booking.patient] += patientPayment;
        if (doctorPayment != 0) claimable[booking.doctor] += doctorPayment;
        if (platformPayment != 0) claimable[treasury] += platformPayment;
        emit ConsultationResolved(id, booking.patient, booking.doctor, patientPayment, doctorPayment, platformPayment);
    }

    /// @notice Patient reclaims the full escrow after 14 days of an unresolved dispute.
    /// @dev Available at the exact timeout, including while paused.
    function claimDisputeRefund(uint256 id) external nonReentrant {
        Booking storage booking = _disputedBooking(id);
        if (msg.sender != booking.patient) revert UnauthorizedBookingActor();
        if (block.timestamp < uint256(booking.disputedAt) + DISPUTE_RESOLUTION_TIMEOUT) revert RefundNotAvailableYet();
        booking.status = Status.Refunded;
        _releaseSlots(booking);
        usdc.safeTransfer(booking.patient, booking.feeUsdc);
        emit ConsultationRefunded(id, booking.patient, booking.feeUsdc);
    }

    /// @notice Patient reclaims the full fee if still open 48 hours after startTime.
    /// @dev Available at the exact deadline, including while paused.
    function claimRefund(uint256 id) external nonReentrant {
        Booking storage booking = _openBooking(id);
        if (msg.sender != booking.patient) revert UnauthorizedBookingActor();
        if (block.timestamp < uint256(booking.startTime) + COMPLETION_WINDOW) revert RefundNotAvailableYet();
        booking.status = Status.Refunded;
        _releaseSlots(booking);
        usdc.safeTransfer(booking.patient, booking.feeUsdc);
        emit ConsultationRefunded(id, booking.patient, booking.feeUsdc);
    }

    /// @notice Withdraw the caller's entire accrued USDC balance to the caller.
    /// @dev Available while paused. Reverts with NothingToWithdraw for a zero balance.
    /// A failed USDC transfer restores the balance and does not undo prior settlements.
    function withdraw() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        claimable[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Return an account's accrued USDC balance available for withdrawal.
    function claimableOf(address account) external view returns (uint256) {
        return claimable[account];
    }

    /// @notice Return a booking, reverting for nonexistent IDs.
    function getBooking(uint256 id) external view returns (Booking memory) {
        if (id == 0 || id > bookingCount) revert BookingNotFound(id);
        return _bookings[id];
    }

    /// @notice Return the patient's complete booking history as IDs.
    function getPatientBookings(address patient) external view returns (uint256[] memory) {
        return _patientBookings[patient];
    }

    /// @notice Return the doctor's complete booking history as IDs.
    function getDoctorBookings(address doctor) external view returns (uint256[] memory) {
        return _doctorBookings[doctor];
    }

    /// @notice Whether the doctor's 15-minute bucket containing startTime is occupied.
    function isSlotTaken(address doctor, uint64 startTime) external view returns (bool) {
        return _slots[doctor][uint256(startTime) / 900];
    }

    /// @notice Block new bookings only; all existing settlement functions remain enabled.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Reenable new bookings.
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Ownership cannot be renounced, preserving an administrator able to unpause.
    function renounceOwnership() public override onlyOwner {
        revert OwnershipRenunciationDisabled();
    }

    /// @dev Retrieve a valid, Booked booking for a state transition.
    function _openBooking(uint256 id) private view returns (Booking storage booking) {
        if (id == 0 || id > bookingCount) revert BookingNotFound(id);
        booking = _bookings[id];
        if (booking.status != Status.Booked) revert BookingNotOpen(id);
    }

    /// @dev Retrieve a valid completion submission that has not been settled or disputed.
    function _submittedBooking(uint256 id) private view returns (Booking storage booking) {
        if (id == 0 || id > bookingCount) revert BookingNotFound(id);
        booking = _bookings[id];
        if (booking.status != Status.CompletionSubmitted) revert CompletionNotSubmitted(id);
    }

    /// @dev Retrieve a valid unresolved dispute.
    function _disputedBooking(uint256 id) private view returns (Booking storage booking) {
        if (id == 0 || id > bookingCount) revert BookingNotFound(id);
        booking = _bookings[id];
        if (booking.status != Status.Disputed) revert BookingNotDisputed(id);
    }

    /// @dev Shared pull-payment accounting for confirmation and permissionless finalization.
    function _completeBooking(Booking storage booking) private {
        booking.status = Status.Completed;
        uint256 platformPayment = Math.mulDiv(booking.feeUsdc, platformFeeBps, BPS_DENOMINATOR);
        uint256 doctorPayment = booking.feeUsdc - platformPayment;
        // Completed slots remain occupied; cancelled/refunded slots are released.
        claimable[booking.doctor] += doctorPayment;
        if (platformPayment != 0) claimable[treasury] += platformPayment;
        emit ConsultationCompleted(booking.id, booking.doctor, doctorPayment, platformPayment);
    }

    /// @dev Release every reserved bucket; bounded to at most sixteen iterations.
    function _releaseSlots(Booking storage booking) private {
        uint256 firstBucket = uint256(booking.startTime) / 900;
        uint256 bucketCount = uint256(booking.durationMins) / 15;
        for (uint256 i; i < bucketCount; ++i) {
            _slots[booking.doctor][firstBucket + i] = false;
        }
    }
}
