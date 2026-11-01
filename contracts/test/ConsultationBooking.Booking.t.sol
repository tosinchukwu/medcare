// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ConsultationBooking} from "../ConsultationBooking.sol";
import {ConsultationBookingTestBase} from "./ConsultationBooking.Base.t.sol";

contract ConsultationBookingBookingTest is ConsultationBookingTestBase {
    // ---------------- constructor ----------------
    function test_Constructor_SetsImmutables() public view {
        assertEq(address(cb.usdc()), address(usdc));
        assertEq(cb.treasury(), treasury);
        assertEq(cb.platformFeeBps(), FEE_BPS);
        assertEq(cb.owner(), owner);
    }

    function test_Constructor_RevertsOnZeroAddresses() public {
        vm.expectRevert(ConsultationBooking.ZeroAddress.selector);
        new ConsultationBooking(address(0), owner, treasury, FEE_BPS);
        vm.expectRevert(ConsultationBooking.ZeroAddress.selector);
        new ConsultationBooking(address(usdc), owner, address(0), FEE_BPS);
    }

    function test_Constructor_RevertsWhenTreasuryIsSelf() public {
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)));
        vm.expectRevert(ConsultationBooking.InvalidTreasury.selector);
        new ConsultationBooking(address(usdc), owner, predicted, FEE_BPS);
    }

    function test_Constructor_RevertsWhenFeeTooHigh() public {
        vm.expectRevert(abi.encodeWithSelector(ConsultationBooking.PlatformFeeTooHigh.selector, uint16(1001)));
        new ConsultationBooking(address(usdc), owner, treasury, 1001);
    }

    // ---------------- doctor admin ----------------
    function test_AddDoctor_RegistersAndEmits() public {
        address d2 = makeAddr("d2");
        vm.expectEmit(true, false, false, true, address(cb));
        emit ConsultationBooking.DoctorAdded(d2, "Dr Two", "Neuro", 50e6, "uri");
        vm.prank(owner);
        cb.addDoctor(d2, "Dr Two", "Neuro", 50e6, "uri");

        ConsultationBooking.Doctor[] memory docs = cb.getDoctors();
        assertEq(docs.length, 2);
        assertEq(docs[1].doctor, d2);
        assertEq(docs[1].feeUsdc, 50e6);
        assertTrue(docs[1].approved && docs[1].active);
    }

    function test_AddDoctor_Reverts() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        cb.addDoctor(makeAddr("x"), "n", "s", 1, "u");

        vm.startPrank(owner);
        vm.expectRevert(ConsultationBooking.ZeroAddress.selector);
        cb.addDoctor(address(0), "n", "s", 1, "u");
        vm.expectRevert(ConsultationBooking.InvalidDoctor.selector);
        cb.addDoctor(address(cb), "n", "s", 1, "u");
        vm.expectRevert(ConsultationBooking.InvalidFee.selector);
        cb.addDoctor(makeAddr("x"), "n", "s", 0, "u");
        vm.expectRevert(abi.encodeWithSelector(ConsultationBooking.DoctorAlreadyApproved.selector, doctor));
        cb.addDoctor(doctor, "n", "s", 1, "u");
        vm.stopPrank();
    }

    function test_RemoveDoctor_BlocksBookingAndAllowsReapprovalWithoutDuplicate() public {
        vm.expectEmit(true, false, false, false, address(cb));
        emit ConsultationBooking.DoctorRemoved(doctor);
        vm.prank(owner);
        cb.removeDoctor(doctor);

        vm.prank(patient);
        vm.expectRevert(abi.encodeWithSelector(ConsultationBooking.DoctorNotApproved.selector, doctor));
        cb.bookConsultation(doctor, START, 60, NOTE, FEE);

        vm.prank(owner);
        cb.addDoctor(doctor, "Dr Who", "General", 70e6, "uri2");
        assertEq(cb.getDoctors().length, 1);
        assertEq(cb.getDoctors()[0].feeUsdc, 70e6);
    }

    function test_RemoveDoctor_Reverts() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        cb.removeDoctor(doctor);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(ConsultationBooking.DoctorNotApproved.selector, stranger));
        cb.removeDoctor(stranger);
    }

    function test_UpdateDoctor_ChangesFutureFeeOnly() public {
        uint256 id = _bookDefault();
        vm.expectEmit(true, false, false, true, address(cb));
        emit ConsultationBooking.DoctorUpdated(doctor, "New", "Spec", 200e6, "u", true);
        vm.prank(doctor);
        cb.updateDoctor("New", "Spec", 200e6, "u", true);

        assertEq(cb.getDoctors()[0].feeUsdc, 200e6);
        assertEq(cb.getBooking(id).feeUsdc, FEE); // snapshotted
    }

    function test_UpdateDoctor_Reverts() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(ConsultationBooking.DoctorNotApproved.selector, stranger));
        cb.updateDoctor("n", "s", 1, "u", true);
        vm.prank(doctor);
        vm.expectRevert(ConsultationBooking.InvalidFee.selector);
        cb.updateDoctor("n", "s", 0, "u", true);
    }

    function test_InactiveDoctorCannotBeBooked() public {
        vm.prank(doctor);
        cb.updateDoctor("n", "s", FEE, "u", false);
        vm.prank(patient);
        vm.expectRevert(abi.encodeWithSelector(ConsultationBooking.DoctorInactive.selector, doctor));
        cb.bookConsultation(doctor, START, 60, NOTE, FEE);
    }

    // ---------------- bookConsultation ----------------
    function test_Book_EscrowsFeeEmitsAndRecords() public {
        vm.expectEmit(true, true, true, true, address(cb));
        emit ConsultationBooking.ConsultationBooked(1, patient, doctor, START, 60, NOTE, FEE);
        uint256 id = _bookDefault();

        assertEq(id, 1);
        assertEq(cb.bookingCount(), 1);
        assertEq(usdc.balanceOf(address(cb)), FEE);
        assertEq(usdc.balanceOf(patient), 10_000e6 - FEE);
        ConsultationBooking.Booking memory b = cb.getBooking(id);
        assertEq(b.patient, patient);
        assertEq(b.doctor, doctor);
        assertEq(b.startTime, START);
        assertEq(b.durationMins, 60);
        assertEq(b.noteHash, NOTE);
        assertEq(uint8(b.status), uint8(ConsultationBooking.Status.Booked));
        assertEq(cb.getPatientBookings(patient).length, 1);
        assertEq(cb.getDoctorBookings(doctor)[0], id);
        assertTrue(cb.isSlotTaken(doctor, START));
        assertTrue(cb.isSlotTaken(doctor, START + 45 minutes));
        assertFalse(cb.isSlotTaken(doctor, START + 60 minutes));
    }

    function test_Book_RevertsWhenFeeAboveMax() public {
        vm.prank(patient);
        vm.expectRevert(abi.encodeWithSelector(ConsultationBooking.FeeAboveMax.selector, FEE, FEE - 1));
        cb.bookConsultation(doctor, START, 60, NOTE, FEE - 1);
    }

    function test_Book_MaxFeeProtectsAgainstFeeIncrease() public {
        vm.prank(doctor);
        cb.updateDoctor("n", "s", FEE + 1, "u", true);
        vm.prank(patient);
        vm.expectRevert(abi.encodeWithSelector(ConsultationBooking.FeeAboveMax.selector, FEE + 1, FEE));
        cb.bookConsultation(doctor, START, 60, NOTE, FEE);
    }

    function test_Book_RevertsOnInvalidDuration() public {
        uint32[5] memory bad = [uint32(0), 10, 20, 255, 255];
        bad[4] = 255;
        for (uint256 i; i < bad.length; ++i) {
            vm.prank(patient);
            vm.expectRevert(ConsultationBooking.InvalidDuration.selector);
            cb.bookConsultation(doctor, START, bad[i], NOTE, FEE);
        }
        // 255 is > 240 and 255 % 15 == 0 -> still invalid; 250 not a multiple of 15
        vm.prank(patient);
        vm.expectRevert(ConsultationBooking.InvalidDuration.selector);
        cb.bookConsultation(doctor, START, 250, NOTE, FEE);
    }

    function test_Book_AcceptsMinAndMaxDuration() public {
        _book(patient, START, 15);
        _book(patient, START + 1 days, 240);
        assertTrue(cb.isSlotTaken(doctor, START + 1 days + 239 minutes));
    }

    function test_Book_RevertsOffGridStart() public {
        uint64[3] memory bad = [START + 1, START + 60, START + 899];
        for (uint256 i; i < bad.length; ++i) {
            vm.prank(patient);
            vm.expectRevert(ConsultationBooking.InvalidStartTime.selector);
            cb.bookConsultation(doctor, bad[i], 15, NOTE, FEE);
        }
    }

    function test_Book_AcceptsAnyQuarterHourOnGrid() public {
        _book(patient, START + 15 minutes, 15);
        _book(patient, START + 30 minutes, 15);
        _book(patient, START + 45 minutes, 15);
    }

    function test_Book_RevertsInsufficientNotice() public {
        // need start >= now + 1h; T0 + 45min is on grid but too soon
        vm.prank(patient);
        vm.expectRevert(ConsultationBooking.InsufficientBookingNotice.selector);
        cb.bookConsultation(doctor, uint64(T0 + 45 minutes), 15, NOTE, FEE);
        // exactly 1h notice is allowed
        _book(patient, uint64(T0 + 1 hours), 15);
    }

    function test_Book_RejectsOverlapAnyWay() public {
        _book(patient, START, 60); // [START, START+60)
        // identical, starts inside, ends inside, fully contains
        uint64[4] memory starts = [START, START + 30 minutes, START - 30 minutes, START - 15 minutes];
        uint32[4] memory durs = [uint32(60), 60, 60, 120];
        for (uint256 i; i < 4; ++i) {
            vm.prank(patient2);
            vm.expectRevert(abi.encodeWithSelector(ConsultationBooking.SlotAlreadyTaken.selector, doctor, starts[i]));
            cb.bookConsultation(doctor, starts[i], durs[i], NOTE, FEE);
        }
    }

    function test_Book_AllowsAdjacentBookings() public {
        _book(patient, START, 60);
        _book(patient2, START + 60 minutes, 30); // right after
        _book(patient2, START - 15 minutes, 15); // right before
        assertEq(cb.bookingCount(), 3);
    }

    function test_Book_FailedOverlapDoesNotLeakPartialReservation() public {
        _book(patient, START + 30 minutes, 15);
        vm.prank(patient2);
        vm.expectRevert();
        cb.bookConsultation(doctor, START, 60, NOTE, FEE); // overlaps the middle bucket
        assertFalse(cb.isSlotTaken(doctor, START)); // reverted whole tx
    }

    function test_GetBooking_RevertsForUnknownId() public {
        vm.expectRevert(abi.encodeWithSelector(ConsultationBooking.BookingNotFound.selector, 0));
        cb.getBooking(0);
        vm.expectRevert(abi.encodeWithSelector(ConsultationBooking.BookingNotFound.selector, 1));
        cb.getBooking(1);
    }

    // ---------------- pause & ownership ----------------
    function test_Pause_OnlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        cb.pause();
        vm.prank(owner);
        cb.pause();
        assertTrue(cb.paused());
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        cb.unpause();
        vm.prank(owner);
        cb.unpause();
        assertFalse(cb.paused());
    }

    function test_Renounce_RevertsForOwner() public {
        vm.prank(owner);
        vm.expectRevert(ConsultationBooking.OwnershipRenunciationDisabled.selector);
        cb.renounceOwnership();
        assertEq(cb.owner(), owner);
    }

    function test_Renounce_NonOwnerRevertsUnauthorized() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        cb.renounceOwnership();
    }

    function test_TwoStepOwnershipTransfer() public {
        vm.prank(owner);
        cb.transferOwnership(stranger);
        assertEq(cb.owner(), owner);
        vm.prank(stranger);
        cb.acceptOwnership();
        assertEq(cb.owner(), stranger);
    }
}
