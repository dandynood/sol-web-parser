pragma solidity >= 0.5.8;
contract Victim {
    bool sent = false;
    address owner; 
    uint number = 2432 / 32;
    uint number2 = number;

    modifier testModifier() {
        uint hellolool;
        _;
    }

    modifier testModifier2() {
        uint lolol;
        _;
    }

    function withdraw() public testModifier testModifier2 {
        //Ether to send
        uint transferAmt = 1 ether;
        require(sent);

        if(!sent){
            //Assign some variables (in a tuple) from return values of call.value()()
            //sent = true;s
            (bool success,) = msg.sender.call.value(transferAmt)("");
            uint hello = 0;
            sent = true;

            //If call fails, throw exception (revert transaction);
            if (!success) {
              revert("The check is failing!!");
            } 
        }

        msg.sender.send(transferAmt);
    }
    
    //A simple function to deposit some Ether to this contract (payable)
    function deposit() public payable {}

    function test() public {
        uint a;
        bool b;
        for(uint i=0;i<3;i++){
            
        }

        while(false){

        }

        do {

        } while(false);

        if(a == 1 || a == 2){

        } else if (b || a==2 || a==1) {
        
        } else if(true && true && true && true) {
            a = 2;
        } else if (((false && false) || false) && a == 1) {
            uint hello = 1;
        } else if (!true && (true && true)) {
            bool gello = true;
        } else if ((true && !true) || (!false || !true) || (true && true)) {
            
        } else if (msg.sender.send(1)) {

        } else {
            uint ballo = 2;
        }

        require(true);
        require(msg.sender.send(1) && a == 2 || true);
        this.deposit();
    }

    function exception() public {
        //failures
        msg.sender.call.value(1)("");
        msg.sender.send(1);

        //test 1 is success
        bool sent = msg.sender.send(1);
        bool sent2 = msg.sender.send(1);    
        
        //test 2 should succeed too
        if(sent){

        }

        //sent2 should fail

        //will pass all
        require(msg.sender.send(1) || msg.sender.send(2));

        //two failures from test 1) plus one from test 2) should score a total of 3  
    }

    function time() public returns (uint) {
        block.timestamp;
        block.number;
        now;

        uint hello = now;

        uint time = block.timestamp;
        uint num = block.number;
        uint time2 = block.timestamp + 2432 / 32;
        time2 = block.timestamp + 323 - 23;
        time2 = block.timestamp;
        uint time3 = time2;
        uint time4 = 3252 + time;
        uint time5 = time + 2324;
        uint hello2 = hello;
        num = 12 + 12;

        tx.origin;
        address origin = tx.origin;

        blockhash(block.timestamp);

        if(owner == tx.origin || time == block.timestamp || num == block.number || time == num) { //should be problematic, especially if there is a interaction inside

        }

        if(true) {

        } else if (num == block.number) {
            bool send = msg.sender.send(1);
        }

        return uint(blockhash(block.timestamp)); //problematic
        
    }

    function delegateCallTest() public {
        msg.sender.delegatecall("");
        (bool success,) = msg.sender.delegatecall("");

        if(true) {

        } else if (false) {
            
        }
    }

    function loops() public {
        uint i;
        for(i=0;i<10;i++){
            uint hello = 2;
            msg.sender.send(1);
        }

        while(i < 11) {
            i++;
        }

        do {
            i++;
        } while(i <= 12);

        if(msg.sender.send(1)) {
            uint hello = 3;
        }
    }
}