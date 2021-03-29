// SPDX-License-Identifier: MIT
pragma solidity >= 0.5.16;
contract Test {
    address payable wiz;
    bool sent = false;

    event Something(uint hello, bool there);

    struct Stuff { 
        address payable payee;
        uint[] array;
    }

    modifier onlywizard { if (msg.sender == wiz) _; }
    modifier mutex1 { require(!sent); sent=true;  _; }
    modifier mutex2Fail { sent=true; if(!sent) { _; } }
    modifier mutex3Fail { sent=true; require(!sent); _;}

    constructor() public {
        wiz = msg.sender;
    }

    function withdraw() public onlywizard returns(bool success) {
        return wiz.send(1);
    }

    function withdraw2() public mutex1 returns (uint result) {
        bool success;
        require(success);
        success = wiz.send(1);
        sent=false;
        return (1 + block.timestamp + 1);
    }

    function withdraw3() public mutex2Fail {
        bool success; 
        success = wiz.send(1);

        if(success) {
            //empty..
        }

        sent=false;
    }

    function withdraw4() public {
        uint i = 3;
        require(sent);
        
        if(i==2) {
            sent = true;
            require(wiz.send(i));
        } else if (i==3) {
            require(wiz.send(i));
        }

        sent=false;
    }

    function loops() mutex3Fail public {
        (uint i, uint y) = (0,2);
        while(i == 0 && y == 2) {
            wiz.send(1);
            y=3;
        }
        do {
            wiz.send(20);
            y=4;
        } while (i == 2 && y == 3);

        for(uint b=0; b < 3; b++) {
            wiz.send(2);
        }

        sent=false;
    } 

    function() payable external {
        uint b = 2; 
        bytes memory oof;
        (bool success,) = msg.sender.call("");
        if(true && msg.sender.send(1)) {

        }
        (bool thing, uint a) = (false,0+1+1);
        (bool test,uint y) = (true,0);
        (thing, a) = (true,2);
        (thing, ) = wiz.delegatecall(msg.data);
        withdraw3();
    }

    function time(bytes32 something) public returns (uint) {
        block.timestamp;
        uint time1 = block.timestamp; //fails test 1
        uint time2 = block.timestamp + 2432 / 32;
        uint time3 = time2;
        uint time5 = time1 + 2324;
        uint num = 12 + 12;

        address origin = tx.origin;

        blockhash(block.timestamp);

        if(msg.sender == tx.origin || time1 == block.timestamp || num == block.number || time1 == num) { //should be no problem

        }
            
        require(time1 == num); //fails test 2 since there is an interaction inside
            bool send = msg.sender.send(1);

        return uint(blockhash(block.timestamp)); //fails test 3, problematic
    }

    function hashing() public returns (uint) {
        bytes32 hash = blockhash(block.number);
        time(blockhash(block.number));
    }

    mapping(address => uint) public balances;
    function indexes() public {
        Stuff memory stuff;
        stuff.array[0];
        stuff.array[0] = 2;
        uint mappingValue = stuff.array[0];
        uint value = 1;
        value = 2;
        value;
        stuff.payee.send(1);
        uint[] memory array = new uint[](3);
        uint[3] memory array2 = [uint(1), value, 3];

        array[2] = 1;
        array[value] = 0;
        uint value2 = array2[1];

        balances[msg.sender] = 2;
        mappingValue = balances[msg.sender];
    }

    function unlock() public {
        if(sent) sent = false;
    }
}
