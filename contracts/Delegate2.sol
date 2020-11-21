pragma solidity >= 0.5.8;
contract Delegate {
    bool sent = false;
    address owner; 

    function withdraw() public {
        //Ether to send
        uint transferAmt = 1 ether;
        require(sent);

        if(!sent){
            //Assign some variables (in a tuple) from return values of call.value()()
            //sent = true;s
            (bool success,) = msg.sender.call.value(transferAmt)("");
            sent = true;

            //If call fails, throw exception (revert transaction);
            if (!success) {
              revert("The check is failing!!");
            } 
        }

        msg.sender.send(transferAmt);
    }

    //For Dangerous Delegates, the score is 1 + n number of delegatecalls
    //This function will score 2 since 2 delegatecalls are using msg.data which is problematic
    //It will not fail noOtherOpcodes since the previous function withdraw() has another interaction which makes the contract has some liquidity (other than delegatecall)
    function delegateCallTest() public {
        msg.sender.delegatecall(msg.data);
        (bool success,) = msg.sender.delegatecall(msg.data);
    }

    //A simple function to make this contract payable
    function deposit() public payable {}
}