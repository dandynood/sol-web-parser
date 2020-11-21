pragma solidity >= 0.5.8;
contract Test {
    address owner;
    bool lock = false; 
    uint private count = 1;
    address payable[] private refundAddresses;
    mapping (address => uint) public refunds;
    
    function increment() public {count += 1;}

    function decrement() public {count -= 1;}   

    function getCount() public view returns(uint) 
    {return count;}

    modifier mutex () {
        bool sent = false;
        require(!sent);
        sent = true;
        _;
    }

    modifier hello() {
        if(true) { _; } else { }
    }

    modifier hello2() {
        if(false) _; else _;
    }

    function withdraw() public hello() hello2() {
        //sends a count of Wei to the caller
        //require(!lock);
        //lock = true; 
        msg.sender.send(count);
    }

    function refundAll() public {
        //loop through an array of addresses
        for(uint i; i < refundAddresses.length; i++) { 
            //unreasonable error handling
            //throws exception on one failure, reverting all refunds
            require(refundAddresses[i].send(refunds[refundAddresses[i]]));
        }
    }

    //A simple function to make this contract payable
    function deposit() public payable {}
}

