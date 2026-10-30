// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ConsultationBooking} from "../ConsultationBooking.sol";
import {ConsultationBookingTestBase} from "./ConsultationBooking.Base.t.sol";

contract ConsultationBookingLifecycleTest is ConsultationBookingTestBase {
    // ---------------- happy path: confirm ----------------
    function test_HappyPath_ConfirmCompletionAndWithdraw() public {
        uint256 id = _bookDefault();
        vm.warp(uint256(START) + 1 hours); // exactly at end
        vm.expectEmit(true, true, false, true, address(cb));
        emit ConsultationBooking.ConsultationCompletionSubmitted(id, doctor, uint64(block.timestamp));
        vm.prank(doctor);
        cb.submitCompletion(id);
        assertEq(uint8(_status(id)), uint8(ConsultationBooking.Status.CompletionSubmitted));
        assertEq(usdc.balanceOf(address(cb)), FEE); // escrow not released yet

        vm.expectEmit(true, true, false, true, address(cb));
        emit ConsultationBooking.ConsultationCompleted(id, doctor, FEE - _platformCut(FEE), _platformCut(FEE));
        vm.prank(patient);
        cb.confirmCompletion(id);
        assertEq(uint8(_status(id)), uint8(ConsultationBooking.Status.Completed));
        assertEq(cb.claimableOf(doctor), 95e6);
        assertEq(cb.claimableOf(treasury), 5e6);
        assertEq(usdc.balanceOf(address(cb)), FEE); // no transfer on completion

        vm.expectEmit(true, false, false, true, address(cb));
        emit ConsultationBooking.Withdrawn(doctor, 95e6);
        vm.prank(doctor);
        cb.withdraw();
        vm.prank(treasury);
        cb.withdraw();

        assertEq(usdc.balanceOf(doctor), 95e6);
        assertEq(usdc.balanceOf(treasury), 5e6);
        assertEq(usdc.balanceOf(address(cb)), 0);
        assertEq(cb.claimableOf(doctor), 0);
        assertEq(cb.claimableOf(treasury), 0);
        assertTrue(cb.isSlotTaken(doctor, START)); // completed slots remain occupied
    }

    // ---------------- happy path: finalize ----------------
    function test_HappyPath_FinalizeAfter24hByAnyone() public {
        uint256 id = _bookAndSubmit();
        uint256 submittedAt = block.timestamp;

        vm.warp(submittedAt + 24 hours - 1);
        vm.expectRevert(ConsultationBooking.DisputeWindowNotElapsed.selector);
        cb.finalizeCompletion(id);

        vm.warp(submittedAt + 24 hours);
        vm.prank(stranger);
        cb.finalizeCompletion(id);
        assertEq(uint8(_status(id)), uint8(ConsultationBooking.Status.Completed));
        assertEq(cb.claimableOf(doctor), 95e6);
        assertEq(cb.claimableOf(treasury), 5e6);

        vm.prank(doctor);
        cb.withdraw();
        vm.prank(treasury);
        cb.withdraw();
        assertEq(usdc.balanceOf(doctor), 95e6);
        assertEq(usdc.balanceOf(treasury), 5e6);
        assertEq(usdc.balanceOf(address(cb)), 0);
    }

    function test_Confirm_StillWorksAfterDisputeWindow() public {
        uint256 id = _bookAndSubmit();
        skip(10 days);
        vm.prank(patient);
        cb.confirmCompletion(id);
        assertEq(uint8(_status(id)), uint8(ConsultationBooking.Status.Completed));
    }

    // ---------------- submitCompletion reverts ----------------
    function test_SubmitCompletion_RevertsBeforeEnd() public {
        uint256 id = _bookDefault();
        vm.warp(uint256(START) + 1 hours - 1);
        vm.prank(doctor);
        vm.expectRevert(ConsultationBooking.ConsultationNotEnded.selector);
        cb.submitCompletion(id);
    }

    function test_SubmitCompletion_RevertsAtOrAfter48h() public {
        uint256 id = _bookDefault();
        vm.warp(uint256(START) + 48 hours);
        vm.prank(doctor);
        vm.expectRevert(ConsultationBooking.CompletionDeadlinePassed.selector);
        cb.submitCompletion(id);
    }

    function test_SubmitCompletion_AllowedJustBefore48h() public {
        uint256 id = _bookDefault();
        vm.warp(uint256(START) + 48 hours - 1);
        vm.prank(doctor);
        cb.submitCompletion(id);
        assertEq(uint8(_status(id)), uint8(ConsultationBooking.Status.CompletionSubmitted));
    }

    function test_SubmitCompletion_RevertsForNonDoctor() public {
        uint256 id = _bookDefault();
        vm.warp(uint256(START) + 2 hours);
        vm.prank(patient);
        vm.expectRevert(ConsultationBooking.UnauthorizedBookingActor.selector);
        cb.submitCompletion(id);
    }

    function test_SubmitCompletion_RevertsWhenNotBookedOrUnknown() public {
        uint256 id = _bookAndSubmit();
        vm.prank(doctor);
        vm.expectRevert(abi.encodeWithSelector(ConsultationBooking.BookingNotOpen.selector, id));
        cb.submitCompletion(id);
        vm.prank(doctor);
        vm.expectRevert(abi.encodeWithSelector(ConsultationBooking.BookingNotFound.selector, 99));
        cb.submitCompletion(99);
    }

    // ---------------- confirm / finalize reverts ----------------
    function test_Confirm_Reverts() public {
        uint256 id = _bookDefault();
        vm.prank(patient);
        vm.expectRevert(abi.encodeWithSelector(ConsultationBooking.CompletionNotSubmitted.selector, id));
        cb.confirmCompletion(id);

        vm.warp(uint256(START) + 1 hours);
        vm.prank(doctor);
        cb.submitCompletion(id);

        vm.prank(stranger);
        vm.expectRevert(ConsultationBooking.UnauthorizedBookingActor.selector);
        cb.confirmCompletion(id);
        vm.prank(doctor);
        vm.expectRevert(ConsultationBooking.UnauthorizedBookingActor.selector);
        cb.confirmCompletion(id);

        vm.prank(patient);
        cb.confirmCompletion(id);
        vm.prank(patient);
        vm.expectRevert(abi.encodeWithSelector(ConsultationBooking.CompletionNotSubmitted.selector, id));
        cb.confirmCompletion(id); // no double payout
    }

    function test_Finalize_RevertsIfNotSubmittedOrAlreadyDone() public {
        uint256 id = _bookDefault();
        vm.expectRevert(abi.encodeWithSelector(ConsultationBooking.CompletionNotSubmitted.selector, id));
        cb.finalizeCompletion(id);
    }

    function test_Finalize_AfterConfirmCannotDoublePay() public {
        uint256 id = _bookAndSubmit();
        vm.prank(patient);
        cb.confirmCompletion(id);
        skip(2 days);
        vm.expectRevert(abi.encodeWithSelector(ConsultationBooking.CompletionNotSubmitted.selector, id));
        cb.finalizeCompletion(id);
        assertEq(cb.claimableOf(doctor), 95e6);
    }

    // ---------------- withdraw ----------------
    function test_Withdraw_RevertsWhenNothing() public {
        vm.prank(stranger);
        vm.expectRevert(ConsultationBooking.NothingToWithdraw.selector);
        cb.withdraw();
    }

    function test_Withdraw_SecondCallReverts() public {
        uint256 id = _bookAndSubmit();
        vm.prank(patient);
        cb.confirmCompletion(id);
        vm.prank(doctor);
        cb.withdraw();
        vm.prank(doctor);
        vm.expectRevert(ConsultationBooking.NothingToWithdraw.selector);
        cb.withdraw();
    }

    // ---------------- cancellations ----------------
    function test_PatientCancelBeforeStart_RefundsDirectlyAndReleasesSlot() public {
        uint256 id = _bookDefault();
        uint256 balBefore = usdc.balanceOf(patient);

        vm.warp(uint256(START) - 1);
        vm.expectEmit(true, true, true, true, address(cb));
        emit ConsultationBooking.ConsultationCancelled(id, patient, patient, FEE);
        vm.prank(patient);
        cb.cancelConsultation(id);

        assertEq(uint8(_status(id)), uint8(ConsultationBooking.Status.Cancelled));
        assertEq(usdc.balanceOf(patient), balBefore + FEE);
        assertEq(usdc.balanceOf(address(cb)), 0);
        assertEq(cb.claimableOf(patient), 0);
        assertFalse(cb.isSlotTaken(doctor, START));
        assertFalse(cb.isSlotTaken(doctor, START + 45 minutes));
    }

    function test_SlotReleasedAfterCancel_CanBeRebooked() public {
        uint256 id = _bookDefault();
        vm.prank(patient);
        cb.cancelConsultation(id);
        uint256 id2 = _book(patient2, START + 15 minutes, 30); // inside the old window
        assertEq(id2, 2);
        assertTrue(cb.isSlotTaken(doctor, START + 15 minutes));
    }

    function test_PatientCancel_RevertsAtOrAfterStart() public {
        uint256 id = _bookDefault();
        vm.warp(START);
        vm.prank(patient);
        vm.expectRevert(ConsultationBooking.AppointmentAlreadyStarted.selector);
        cb.cancelConsultation(id);
    }

    function test_Cancel_RevertsForStrangerAndNotOpen() public {
        uint256 id = _bookDefault();
        vm.prank(stranger);
        vm.expectRevert(ConsultationBooking.UnauthorizedBookingActor.selector);
        cb.cancelConsultation(id);

        vm.prank(patient);
        cb.cancelConsultation(id);
        vm.prank(patient);
        vm.expectRevert(abi.encodeWithSelector(ConsultationBooking.BookingNotOpen.selector, id));
        cb.cancelConsultation(id);
        vm.expectRevert(abi.encodeWithSelector(ConsultationBooking.BookingNotFound.selector, 0));
        cb.cancelConsultation(0);
    }

    function test_DoctorCancel_CreditsPatientClaimableAndReleasesSlot() public {
        uint256 id = _bookDefault();
        vm.expectEmit(true, true, true, true, address(cb));
        emit ConsultationBooking.ConsultationCancelled(id, doctor, patient, FEE);
        vm.prank(doctor);
        cb.cancelConsultation(id);

        assertEq(uint8(_status(id)), uint8(ConsultationBooking.Status.Cancelled));
        assertEq(cb.claimableOf(patient), FEE);
        assertEq(usdc.balanceOf(address(cb)), FEE); // pull payment, not pushed
        assertFalse(cb.isSlotTaken(doctor, START));

        uint256 before = usdc.balanceOf(patient);
        vm.prank(patient);
        cb.withdraw();
        assertEq(usdc.balanceOf(patient), before + FEE);
    }

    function test_DoctorCancel_AllowedAfterStartAndWhenRemoved() public {
        uint256 id = _bookDefault();
        vm.prank(owner);
        cb.removeDoctor(doctor);
        vm.warp(uint256(START) + 3 hours);
        vm.prank(doctor);
        cb.cancelConsultation(id);
        assertEq(cb.claimableOf(patient), FEE);
    }

    // ---------------- no-show refund ----------------
    function test_ClaimRefund_AtStartPlus48h() public {
        uint256 id = _bookDefault();
        uint256 balBefore = usdc.balanceOf(patient);

        vm.warp(uint256(START) + 48 hours - 1);
        vm.prank(patient);
        vm.expectRevert(ConsultationBooking.RefundNotAvailableYet.selector);
        cb.claimRefund(id);

        vm.warp(uint256(START) + 48 hours);
        vm.expectEmit(true, true, false, true, address(cb));
        emit ConsultationBooking.ConsultationRefunded(id, patient, FEE);
        vm.prank(patient);
        cb.claimRefund(id);

        assertEq(uint8(_status(id)), uint8(ConsultationBooking.Status.Refunded));
        assertEq(usdc.balanceOf(patient), balBefore + FEE);
        assertEq(usdc.balanceOf(address(cb)), 0);
        assertFalse(cb.isSlotTaken(doctor, START));
    }

    function test_ClaimRefund_RevertsForNonPatientAndNonOpen() public {
        uint256 id = _bookDefault();
        vm.warp(uint256(START) + 48 hours);
        vm.prank(stranger);
        vm.expectRevert(ConsultationBooking.UnauthorizedBookingActor.selector);
        cb.claimRefund(id);

        vm.prank(patient);
        cb.claimRefund(id);
        vm.prank(patient);
        vm.expectRevert(abi.encodeWithSelector(ConsultationBooking.BookingNotOpen.selector, id));
        cb.claimRefund(id);
    }

    function test_ClaimRefund_UnavailableOnceCompletionSubmitted() public {
        uint256 id = _bookAndSubmit();
        vm.warp(uint256(START) + 48 hours);
        vm.prank(patient);
        vm.expectRevert(abi.encodeWithSelector(ConsultationBooking.BookingNotOpen.selector, id));
        cb.claimRefund(id);
    }

    // ---------------- pause only blocks new bookings ----------------
    function test_Pause_BlocksOnlyNewBookings() public {
        uint256 id1 = _bookDefault();
        uint256 id2 = _book(patient, START + 1 days, 60);
        uint256 id3 = _book(patient, START + 2 days, 60);

        vm.prank(owner);
        cb.pause();

        // new booking blocked
        vm.prank(patient);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        cb.bookConsultation(doctor, START + 3 days, 60, NOTE, FEE);

        // cancel works (patient + doctor)
        vm.prank(patient);
        cb.cancelConsultation(id3);
        vm.prank(doctor);
        cb.cancelConsultation(id2);

        // submit / confirm / withdraw work
        vm.warp(uint256(START) + 1 hours);
        vm.prank(doctor);
        cb.submitCompletion(id1);
        vm.prank(patient);
        cb.confirmCompletion(id1);
        vm.prank(doctor);
        cb.withdraw();
        vm.prank(treasury);
        cb.withdraw();
        vm.prank(patient);
        cb.withdraw(); // refund credited by doctor cancel of id2
        assertEq(usdc.balanceOf(doctor), 95e6);
    }

    function test_Pause_DoesNotBlockNoShowRefundDisputesOrFinalize() public {
        uint256 noShow = _book(patient, START + 5 days, 60);
        uint256 submitted = _bookAndSubmit(); // at START+1h
        vm.prank(owner);
        cb.pause();

        vm.prank(patient);
        cb.disputeCompletion(submitted);
        vm.prank(owner);
        cb.resolveDispute(submitted, 5_000);

        vm.warp(uint256(START) + 5 days + 48 hours);
        vm.prank(patient);
        cb.claimRefund(noShow);
        assertEq(uint8(_status(noShow)), uint8(ConsultationBooking.Status.Refunded));
    }

    function test_Unpause_AllowsBookingAgain() public {
        vm.prank(owner);
        cb.pause();
        vm.prank(owner);
        cb.unpause();
        _bookDefault();
        assertEq(cb.bookingCount(), 1);
    }
}
