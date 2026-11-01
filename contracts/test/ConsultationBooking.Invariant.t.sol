// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ConsultationBooking} from "../ConsultationBooking.sol";
import {MockUSDC} from "./MockUSDC.sol";

/// @dev Drives bounded random actions against the escrow. Reverting actions are swallowed.
contract ConsultationBookingHandler is Test {
    ConsultationBooking public cb;
    MockUSDC public usdc;
    address public owner;
    address[] public patients;
    address[] public doctors;
    address public treasury;

    constructor(ConsultationBooking _cb, MockUSDC _usdc, address _owner, address[] memory _patients, address[] memory _doctors) {
        cb = _cb;
        usdc = _usdc;
        owner = _owner;
        treasury = _cb.treasury();
        patients = _patients;
        doctors = _doctors;
    }

    function _id(uint256 seed) internal view returns (uint256) {
        uint256 n = cb.bookingCount();
        return n == 0 ? 0 : bound(seed, 1, n);
    }

    function book(uint256 pSeed, uint256 dSeed, uint256 slotSeed, uint256 durSeed) external {
        address p = patients[pSeed % patients.length];
        address d = doctors[dSeed % doctors.length];
        uint256 base = ((block.timestamp + 1 hours + 899) / 900) * 900;
        uint64 start = uint64(base + bound(slotSeed, 0, 24) * 900);
        uint32 dur = uint32(bound(durSeed, 1, 16) * 15);
        vm.prank(p);
        try cb.bookConsultation(d, start, dur, bytes32(slotSeed), type(uint256).max) {} catch {}
    }

    function cancel(uint256 idSeed, bool byDoctor) external {
        uint256 id = _id(idSeed);
        if (id == 0) return;
        ConsultationBooking.Booking memory b = cb.getBooking(id);
        vm.prank(byDoctor ? b.doctor : b.patient);
        try cb.cancelConsultation(id) {} catch {}
    }

    function submit(uint256 idSeed) external {
        uint256 id = _id(idSeed);
        if (id == 0) return;
        vm.prank(cb.getBooking(id).doctor);
        try cb.submitCompletion(id) {} catch {}
    }

    function confirm(uint256 idSeed) external {
        uint256 id = _id(idSeed);
        if (id == 0) return;
        vm.prank(cb.getBooking(id).patient);
        try cb.confirmCompletion(id) {} catch {}
    }

    function dispute(uint256 idSeed) external {
        uint256 id = _id(idSeed);
        if (id == 0) return;
        vm.prank(cb.getBooking(id).patient);
        try cb.disputeCompletion(id) {} catch {}
    }

    function finalize(uint256 idSeed) external {
        uint256 id = _id(idSeed);
        if (id == 0) return;
        try cb.finalizeCompletion(id) {} catch {}
    }

    function resolve(uint256 idSeed, uint16 shareBps) external {
        uint256 id = _id(idSeed);
        if (id == 0) return;
        vm.prank(owner);
        try cb.resolveDispute(id, uint16(bound(shareBps, 0, 10_000))) {} catch {}
    }

    function claimDisputeRefund(uint256 idSeed) external {
        uint256 id = _id(idSeed);
        if (id == 0) return;
        vm.prank(cb.getBooking(id).patient);
        try cb.claimDisputeRefund(id) {} catch {}
    }

    function claimRefund(uint256 idSeed) external {
        uint256 id = _id(idSeed);
        if (id == 0) return;
        vm.prank(cb.getBooking(id).patient);
        try cb.claimRefund(id) {} catch {}
    }

    function withdraw(uint256 who) external {
        uint256 total = patients.length + doctors.length + 1;
        uint256 i = who % total;
        address a = i < patients.length ? patients[i] : (i < patients.length + doctors.length ? doctors[i - patients.length] : treasury);
        vm.prank(a);
        try cb.withdraw() {} catch {}
    }

    function warp(uint256 secs) external {
        skip(bound(secs, 0, 3 days));
    }

    function actors() external view returns (address[] memory all) {
        all = new address[](patients.length + doctors.length + 1);
        for (uint256 i; i < patients.length; ++i) all[i] = patients[i];
        for (uint256 i; i < doctors.length; ++i) all[patients.length + i] = doctors[i];
        all[all.length - 1] = treasury;
    }
}

contract ConsultationBookingInvariantTest is Test {
    uint256 internal constant T0 = 1_700_000_100;

    ConsultationBooking internal cb;
    MockUSDC internal usdc;
    ConsultationBookingHandler internal handler;

    function setUp() public {
        vm.warp(T0);
        address owner = makeAddr("owner");
        address treasury = makeAddr("treasury");
        usdc = new MockUSDC();
        cb = new ConsultationBooking(address(usdc), owner, treasury, 500);

        address[] memory ps = new address[](3);
        address[] memory ds = new address[](2);
        for (uint256 i; i < ps.length; ++i) {
            ps[i] = makeAddr(string.concat("patient", vm.toString(i)));
            usdc.mint(ps[i], 1_000_000e6);
            vm.prank(ps[i]);
            usdc.approve(address(cb), type(uint256).max);
        }
        for (uint256 i; i < ds.length; ++i) {
            ds[i] = makeAddr(string.concat("doctor", vm.toString(i)));
            vm.prank(owner);
            cb.addDoctor(ds[i], "d", "s", (i + 1) * 37e6 + 1, "u");
        }

        handler = new ConsultationBookingHandler(cb, usdc, owner, ps, ds);
        targetContract(address(handler));
    }

    function _openEscrow() internal view returns (uint256 sum) {
        uint256 n = cb.bookingCount();
        for (uint256 id = 1; id <= n; ++id) {
            ConsultationBooking.Booking memory b = cb.getBooking(id);
            if (
                b.status == ConsultationBooking.Status.Booked || b.status == ConsultationBooking.Status.CompletionSubmitted
                    || b.status == ConsultationBooking.Status.Disputed
            ) sum += b.feeUsdc;
        }
    }

    function _claimableSum() internal view returns (uint256 sum) {
        address[] memory all = handler.actors();
        for (uint256 i; i < all.length; ++i) sum += cb.claimableOf(all[i]);
    }

    /// PROPERTY: the escrow's USDC always covers open escrow + everything claimable.
    function invariant_BalanceCoversEscrowAndClaimable() public view {
        assertGe(usdc.balanceOf(address(cb)), _openEscrow() + _claimableSum());
    }

    /// PROPERTY: with no donations, accounting is exact (no stranded or phantom USDC).
    function invariant_AccountingIsExact() public view {
        assertEq(usdc.balanceOf(address(cb)), _openEscrow() + _claimableSum());
    }
}
