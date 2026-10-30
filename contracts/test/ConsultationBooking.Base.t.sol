// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ConsultationBooking} from "../ConsultationBooking.sol";
import {MockUSDC} from "./MockUSDC.sol";

abstract contract ConsultationBookingTestBase is Test {
    // 1_700_000_100 is a multiple of 900, so T0 + k*900 stays on the 15-minute grid.
    uint256 internal constant T0 = 1_700_000_100;
    uint64 internal constant START = uint64(T0 + 1 days);
    uint16 internal constant FEE_BPS = 500; // 5%
    uint256 internal constant FEE = 100e6;
    bytes32 internal constant NOTE = keccak256("salted-note");

    ConsultationBooking internal cb;
    MockUSDC internal usdc;

    address internal owner = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal doctor = makeAddr("doctor");
    address internal patient = makeAddr("patient");
    address internal patient2 = makeAddr("patient2");
    address internal stranger = makeAddr("stranger");

    function setUp() public virtual {
        vm.warp(T0);
        usdc = new MockUSDC();
        cb = new ConsultationBooking(address(usdc), owner, treasury, FEE_BPS);

        vm.prank(owner);
        cb.addDoctor(doctor, "Dr Who", "General", FEE, "ipfs://doctor");

        _fund(patient);
        _fund(patient2);
    }

    function _fund(address who) internal {
        usdc.mint(who, 10_000e6);
        vm.prank(who);
        usdc.approve(address(cb), type(uint256).max);
    }

    function _book(address who, uint64 start, uint32 mins) internal returns (uint256 id) {
        vm.prank(who);
        id = cb.bookConsultation(doctor, start, mins, NOTE, FEE);
    }

    function _bookDefault() internal returns (uint256 id) {
        id = _book(patient, START, 60);
    }

    /// @dev Warp to the end of a 60-minute START appointment and have the doctor submit completion.
    function _bookAndSubmit() internal returns (uint256 id) {
        id = _bookDefault();
        vm.warp(uint256(START) + 1 hours);
        vm.prank(doctor);
        cb.submitCompletion(id);
    }

    /// @dev Book, submit, then patient disputes right away.
    function _bookAndDispute() internal returns (uint256 id) {
        id = _bookAndSubmit();
        vm.prank(patient);
        cb.disputeCompletion(id);
    }

    function _status(uint256 id) internal view returns (ConsultationBooking.Status) {
        return cb.getBooking(id).status;
    }

    function _platformCut(uint256 amount) internal pure returns (uint256) {
        return (amount * FEE_BPS) / 10_000;
    }
}
