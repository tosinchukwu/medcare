// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ConsultationBooking} from "../ConsultationBooking.sol";
import {ConsultationBookingTestBase} from "./ConsultationBooking.Base.t.sol";

contract ConsultationBookingFuzzTest is ConsultationBookingTestBase {
    /// @dev Deploy a fresh escrow with an arbitrary fee/bps and book a single appointment.
    function _fresh(uint256 fee, uint16 bps) internal returns (ConsultationBooking c, uint256 id) {
        c = new ConsultationBooking(address(usdc), owner, treasury, bps);
        vm.prank(owner);
        c.addDoctor(doctor, "d", "s", fee, "u");
        usdc.mint(patient, fee);
        vm.startPrank(patient);
        usdc.approve(address(c), fee);
        id = c.bookConsultation(doctor, START, 60, NOTE, fee);
        vm.stopPrank();
        vm.warp(uint256(START) + 1 hours);
        vm.prank(doctor);
        c.submitCompletion(id);
    }

    function testFuzz_CompletionFeeSplitSumsToFee(uint256 fee, uint16 bps) public {
        fee = bound(fee, 1, 1e15);
        bps = uint16(bound(bps, 0, 1_000));
        (ConsultationBooking c, uint256 id) = _fresh(fee, bps);

        vm.prank(patient);
        c.confirmCompletion(id);

        uint256 platform = c.claimableOf(treasury);
        uint256 doc = c.claimableOf(doctor);
        assertEq(doc + platform, fee, "split must equal fee");
        assertEq(platform, (fee * bps) / 10_000, "platform = floor(fee*bps/1e4)");
        assertLe(platform, fee / 10 + 1, "platform <= 10%");

        vm.prank(doctor);
        c.withdraw();
        if (platform != 0) {
            vm.prank(treasury);
            c.withdraw();
        }
        assertEq(usdc.balanceOf(address(c)), 0);
    }

    function testFuzz_FinalizeMatchesConfirmSplit(uint256 fee, uint16 bps) public {
        fee = bound(fee, 1, 1e15);
        bps = uint16(bound(bps, 0, 1_000));
        (ConsultationBooking c, uint256 id) = _fresh(fee, bps);
        skip(24 hours);
        c.finalizeCompletion(id);
        assertEq(c.claimableOf(doctor) + c.claimableOf(treasury), fee);
    }

    function testFuzz_ResolveSplitConservesFee(uint256 fee, uint16 bps, uint16 shareBps) public {
        fee = bound(fee, 1, 1e15);
        bps = uint16(bound(bps, 0, 1_000));
        shareBps = uint16(bound(shareBps, 0, 10_000));
        (ConsultationBooking c, uint256 id) = _fresh(fee, bps);
        vm.prank(patient);
        c.disputeCompletion(id);
        vm.prank(owner);
        c.resolveDispute(id, shareBps);

        uint256 p = c.claimableOf(patient);
        uint256 d = c.claimableOf(doctor);
        uint256 t = c.claimableOf(treasury);
        assertEq(p + d + t, fee, "resolution must conserve escrow");
        assertEq(p, (fee * shareBps) / 10_000);
        // fee applies to the doctor portion only
        assertEq(t, ((fee - p) * bps) / 10_000);
        if (shareBps == 10_000) assertEq(t, 0);
    }
}
