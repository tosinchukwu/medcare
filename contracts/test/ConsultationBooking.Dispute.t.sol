// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ConsultationBooking} from "../ConsultationBooking.sol";
import {ConsultationBookingTestBase} from "./ConsultationBooking.Base.t.sol";

contract ConsultationBookingDisputeTest is ConsultationBookingTestBase {
    function test_Dispute_HappyPathEmitsAndBlocksFinalize() public {
        uint256 id = _bookAndSubmit();
        vm.expectEmit(true, true, false, true, address(cb));
        emit ConsultationBooking.ConsultationDisputed(id, patient, uint64(block.timestamp));
        vm.prank(patient);
        cb.disputeCompletion(id);

        assertEq(uint8(_status(id)), uint8(ConsultationBooking.Status.Disputed));
        assertEq(cb.getBooking(id).disputedAt, block.timestamp);

        skip(2 days);
        vm.expectRevert(abi.encodeWithSelector(ConsultationBooking.CompletionNotSubmitted.selector, id));
        cb.finalizeCompletion(id);
        vm.prank(patient);
        vm.expectRevert(abi.encodeWithSelector(ConsultationBooking.CompletionNotSubmitted.selector, id));
        cb.confirmCompletion(id);
    }

    function test_Dispute_AllowedOneSecondBeforeDeadline() public {
        uint256 id = _bookAndSubmit();
        skip(24 hours - 1);
        vm.prank(patient);
        cb.disputeCompletion(id);
        assertEq(uint8(_status(id)), uint8(ConsultationBooking.Status.Disputed));
    }

    function test_Dispute_RevertsAtDeadline() public {
        uint256 id = _bookAndSubmit();
        skip(24 hours);
        vm.prank(patient);
        vm.expectRevert(ConsultationBooking.DisputeDeadlinePassed.selector);
        cb.disputeCompletion(id);
    }

    function test_Dispute_RevertsForNonPatientAndNotSubmitted() public {
        uint256 id = _bookDefault();
        vm.prank(patient);
        vm.expectRevert(abi.encodeWithSelector(ConsultationBooking.CompletionNotSubmitted.selector, id));
        cb.disputeCompletion(id);

        vm.warp(uint256(START) + 1 hours);
        vm.prank(doctor);
        cb.submitCompletion(id);
        vm.prank(doctor);
        vm.expectRevert(ConsultationBooking.UnauthorizedBookingActor.selector);
        cb.disputeCompletion(id);
    }

    // ---------------- resolveDispute ----------------
    function test_Resolve_SplitCreditsAllThreeParties() public {
        uint256 id = _bookAndDispute();
        // 40% patient -> 40; doctor portion 60; platform 5% of 60 = 3; doctor 57
        vm.expectEmit(true, true, true, true, address(cb));
        emit ConsultationBooking.ConsultationResolved(id, patient, doctor, 40e6, 57e6, 3e6);
        vm.prank(owner);
        cb.resolveDispute(id, 4_000);

        assertEq(uint8(_status(id)), uint8(ConsultationBooking.Status.Resolved));
        assertEq(cb.claimableOf(patient), 40e6);
        assertEq(cb.claimableOf(doctor), 57e6);
        assertEq(cb.claimableOf(treasury), 3e6);
        assertTrue(cb.isSlotTaken(doctor, START)); // partial resolutions keep slots

        vm.prank(patient);
        cb.withdraw();
        vm.prank(doctor);
        cb.withdraw();
        vm.prank(treasury);
        cb.withdraw();
        assertEq(usdc.balanceOf(address(cb)), 0);
    }

    function test_Resolve_FullPatientShareReleasesSlotsNoFee() public {
        uint256 id = _bookAndDispute();
        vm.prank(owner);
        cb.resolveDispute(id, 10_000);
        assertEq(cb.claimableOf(patient), FEE);
        assertEq(cb.claimableOf(doctor), 0);
        assertEq(cb.claimableOf(treasury), 0);
        assertFalse(cb.isSlotTaken(doctor, START));
    }

    function test_Resolve_ZeroPatientShareIsLikeCompletion() public {
        uint256 id = _bookAndDispute();
        vm.prank(owner);
        cb.resolveDispute(id, 0);
        assertEq(cb.claimableOf(patient), 0);
        assertEq(cb.claimableOf(doctor), 95e6);
        assertEq(cb.claimableOf(treasury), 5e6);
        assertTrue(cb.isSlotTaken(doctor, START));
    }

    function test_Resolve_Reverts() public {
        uint256 id = _bookAndDispute();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        cb.resolveDispute(id, 5_000);

        vm.prank(owner);
        vm.expectRevert(ConsultationBooking.InvalidPatientShare.selector);
        cb.resolveDispute(id, 10_001);

        vm.prank(owner);
        cb.resolveDispute(id, 5_000);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(ConsultationBooking.BookingNotDisputed.selector, id));
        cb.resolveDispute(id, 5_000);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(ConsultationBooking.BookingNotFound.selector, 42));
        cb.resolveDispute(42, 5_000);
    }

    function test_Resolve_RevertsOnUndisputedBooking() public {
        uint256 id = _bookDefault();
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(ConsultationBooking.BookingNotDisputed.selector, id));
        cb.resolveDispute(id, 5_000);
    }

    // ---------------- claimDisputeRefund ----------------
    function test_ClaimDisputeRefund_After14Days() public {
        uint256 id = _bookAndDispute();
        uint256 disputedAt = block.timestamp;
        uint256 balBefore = usdc.balanceOf(patient);

        vm.warp(disputedAt + 14 days - 1);
        vm.prank(patient);
        vm.expectRevert(ConsultationBooking.RefundNotAvailableYet.selector);
        cb.claimDisputeRefund(id);

        vm.warp(disputedAt + 14 days);
        vm.expectEmit(true, true, false, true, address(cb));
        emit ConsultationBooking.ConsultationRefunded(id, patient, FEE);
        vm.prank(patient);
        cb.claimDisputeRefund(id);

        assertEq(uint8(_status(id)), uint8(ConsultationBooking.Status.Refunded));
        assertEq(usdc.balanceOf(patient), balBefore + FEE);
        assertEq(usdc.balanceOf(address(cb)), 0);
        assertFalse(cb.isSlotTaken(doctor, START));

        // owner can no longer resolve
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(ConsultationBooking.BookingNotDisputed.selector, id));
        cb.resolveDispute(id, 5_000);
    }

    function test_ClaimDisputeRefund_RevertsForNonPatientAndNonDisputed() public {
        uint256 id = _bookAndDispute();
        skip(14 days);
        vm.prank(stranger);
        vm.expectRevert(ConsultationBooking.UnauthorizedBookingActor.selector);
        cb.claimDisputeRefund(id);

        vm.prank(owner);
        cb.resolveDispute(id, 5_000); // owner may still resolve after the timeout if patient hasn't claimed
        vm.prank(patient);
        vm.expectRevert(abi.encodeWithSelector(ConsultationBooking.BookingNotDisputed.selector, id));
        cb.claimDisputeRefund(id);
    }

    function test_ClaimDisputeRefund_WorksWhilePaused() public {
        uint256 id = _bookAndDispute();
        vm.prank(owner);
        cb.pause();
        skip(14 days);
        vm.prank(patient);
        cb.claimDisputeRefund(id);
        assertEq(uint8(_status(id)), uint8(ConsultationBooking.Status.Refunded));
    }
}
