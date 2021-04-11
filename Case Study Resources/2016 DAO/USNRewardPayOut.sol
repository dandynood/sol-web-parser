import "./RewardOffer.sol";

pragma solidity ^0.4.26;
contract USNRewardPayOut {

     RewardOffer public usnContract;

     function USNRewardPayOut(RewardOffer _usnContract) {
          usnContract = _usnContract;
     }

     // interface for USN
     function payOneTimeReward() returns(bool) {
         if (msg.value < usnContract.getDeploymentReward())
             revert();

         if (usnContract.getOriginalClient().DAOrewardAccount().call.value(msg.value)()) {
             return true;
         } else {
             revert();
         }
     }

     // pay reward
     function payReward() returns(bool) {
         if (usnContract.getOriginalClient().DAOrewardAccount().call.value(msg.value)()) {
             return true;
         } else {
             revert();
         }
     }
}
