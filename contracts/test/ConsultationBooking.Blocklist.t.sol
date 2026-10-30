// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ConsultationBooking} from "../ConsultationBooking.sol";
import {ConsultationBookingTestBase} from "./ConsultationBooking.Base.t.sol";

/// @dev The mock token reverts on any transfer to a blocked recipient (USDC-blocklist style).
contract ConsultationBookingBlocklistTest is ConsultationBookingTestBase {
    function _blockDoctorAndTreasury() internal {
        usdc.setBlocked(doctor, true);
        usdc.setBlocked(treasury, true);
    }

    function test_ConfirmCompletion_SucceedsWhenRecipientsBlocked() public {
        uint256 id = _bookAndSubmit();
        _blockDoctorAndTreasury();

        vm.prank(patient);
        cb.confirmCompletion(id);

        assertEq(uint8(_status(id)), uint8(ConsultationBooking.Status.Completed));
        assertEq(cb.claimableOf(doctor), 95e6);
        assertEq(cb.claimableOf(treasury), 5e6);
        assertEq(usdc.balanceOf(address(cb)), FEE);
    }

    function test_FinalizeCompletion_SucceedsWhenRecipientsBlocked() public {
        uint256 id = _bookAndSubmit();
        _blockDoctorAndTreasury();
        skip(24 hours);

        vm.prank(stranger);
        cb.finalizeCompletion(id);

        assertEq(uint8(_status(id)), uint8(ConsultationBooking.Status.Completed));
        assertEq(cb.claimableOf(doctor), 95e6);
        assertEq(cb.claimableOf(treasury), 5e6);
    }

    function test_Withdraw_RevertsWhileBlockedKeepsBalanceThenSucceedsAfterUnblock() public {
        uint256 id = _bookAndSubmit();
        _blockDoctorAndTreasury();
        vm.prank(patient);
        cb.confirmCompletion(id);

        vm.prank(doctor);
        vm.expectRevert(abi.encodeWithSelector(bytes4(keccak256("BlockedRecipient(address)")), doctor));
        cb.withdraw();
        assertEq(cb.claimableOf(doctor), 95e6); // balance restored on failure

        // one blocked recipient does not affect another account's settlement
        usdc.setBlocked(treasury, false);
        vm.prank(treasury);
        cb.withdraw();
        assertEq(usdc.balanceOf(treasury), 5e6);

        usdc.setBlocked(doctor, false);
        vm.prank(doctor);
        cb.withdraw();
        assertEq(usdc.balanceOf(doctor), 95e6);
        assertEq(usdc.balanceOf(address(cb)), 0);
    }

    function test_ResolveDispute_SucceedsWhenAllPartiesBlocked() public {
        uint256 id = _bookAndDispute();
        usdc.setBlocked(patient, true);
        _blockDoctorAndTreasury();

        vm.prank(owner);
        cb.resolveDispute(id, 4_000);
        assertEq(cb.claimableOf(patient), 40e6);
        assertEq(cb.claimableOf(doctor), 57e6);
        assertEq(cb.claimableOf(treasury), 3e6);
    }

    function test_DoctorCancel_SucceedsWhenPatientBlocked() public {
        uint256 id = _bookDefault();
        usdc.setBlocked(patient, true);
        vm.prank(doctor);
        cb.cancelConsultation(id);
        assertEq(cb.claimableOf(patient), FEE);
        assertFalse(cb.isSlotTaken(doctor, START));
    }
}
