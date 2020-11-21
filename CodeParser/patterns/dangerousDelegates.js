/*jshint esversion: 9*/
/* eslint-env es6 */
var dictionary = require("../dictionary.json");
const chalk = require('chalk');
const okay = chalk.green;
const error = chalk.red;
/*
    Dangerous Delegates are when a contract over relies on "delegatecalls" specifically. This is means relying on -
    delegatecalls ONLY for Ether manipulation, which involves dependency on external code (external libraries) to perform critical actions.

    This is problematic as relying on delegatecalls can lead to:
    1) frozen ether liquidity as the external delegate code or library may change or be destroyed 
    2) calling any other unsecured public function if the delegatecall uses msg.data as an argument

    Because of this, it can be argued that delegatecall's usage is discouraged and that reusing code in different forms is more secure.
    Usage of "internal libraries" (with internal modifiers) is one example. External libraries if needed should only be linked via command line and not via delegate (such as a library provider contract).

    From this scenario we can test whether a contract:
    1) uses solely delegatecalls or not to judge its liquidity (if given the contract/any of its function is payable)
    2) if any delegatecalls uses msg.data as an argument

    Expected results:
    scoreLimit = 1 + n number of delegatecalls. 1 refers to noOtherOpcodes and "n" is determine by how many delegatecalls are there (used for test 2).
    score = increases as noOtherOpcodes is true, or if the "n" number of delegates are found using msgData. noOtherOpcodes is checked on Test 1) and n number is checked on Test 2).
    noOtherOpcodes = boolean.
    delegateCallMsgData = [array of interactions using msg.data in their parameters].
    message = formatted console message using chalk.
*/
module.exports = {

    //Score that increments base on issues found
    score:  0,
    scoreLimit: 1, //score of 1 for noOtherOpcodes, count and add onto how many delegate calls there are with msg.data
    /*1. Define checks-effects-interaction code order variant*/
    order: {
        effects: [
            dictionary.Statements.Assignment,
            dictionary.Statements.VariableDeclarationStatement
        ],
        interactions: [
            dictionary.Opcode.Call,
            dictionary.Opcode.Send,
            dictionary.Opcode.Transfer,
            dictionary.Opcode.StaticCall,
            dictionary.Opcode.CallCode,
            dictionary.Opcode.DelegateCall
        ],
        checks: [
            dictionary.Opcode.Require,
            dictionary.Statements.IfStatement,
            dictionary.Statements.ElseIfStatement
        ]
    },
    /*2 Define the necessary flags we need for testing */
    interactions : [],
    delegateCallMsgData: [],

    //For finding all interactions in the contract to be used in later tests
    //This essentially would contain the interaction statements in the array as interactions[i].interaction
    findInteractions : function(sequence, functionName) {
        for(let i = 0; i < sequence.length; i++) {
            let statement = {};
            //if we find any interaction statement, save it for later
            if(this.order.interactions.includes(sequence[i].nodeType)) { 
                statement.interaction = sequence[i];
                statement.functionName = functionName;
                this.interactions.push(statement);
            }
            //check if the interaction exist in an assignment statement
            if(sequence[i].initialValue) {
                if(this.order.interactions.includes(sequence[i].initialValue)) { 
                    statement.interaction = sequence[i];
                    statement.functionName = functionName;
                    this.interactions.push(statement);
                }
            }
            //if the interaction is an argument for require/if
            //Usually this can only be done for send()
            if(this.order.checks.includes(sequence[i].nodeType)){
                let conditions = sequence[i].conditions;
                for(let cond = 0; cond < conditions.length; cond++){
                    if((conditions[cond].condition && this.order.interactions.includes(conditions[cond].condition)) || 
                    (conditions[cond].left && this.order.interactions.includes(conditions[cond].left))) {
                        statement.interaction = sequence[i];
                        statement.functionName = functionName;
                        this.interactions.push(statement);
                    }
                }
            }

            if(sequence[i].subBlock) {
                if(sequence[i].subBlock.length !== 0) {
                    this.findInteractions(sequence[i].subBlock,functionName);
                }
            }
            //if any ifstatements are found via truebody, unpack. Also note as it is a found check
            if(sequence[i].trueBody){
                this.findInteractions(sequence[i].trueBody,functionName);
                if(sequence[i].falseBody) {
                    let elseIf = [sequence[i].falseBody];
                    this.findInteractions(elseIf,functionName);
                }
            }
        }
    },

    //Test 1) Determine the contract's liquidity by finding other opcodes rather than just delegateCall/or that if the payable contract is a sink (no plain ether transfer possible)
    noOtherOpcodes: true,
    foundDelegateCall: false,
    determineLiquidity : function(interactions) {
        for(let i = 0; i < interactions.length; i++) {
            //if we find at least one interaction not that of DelegateCall, we can say there is other opcodes being used. 
            if(this.order.interactions.includes(interactions[i].interaction.nodeType) && interactions[i].interaction.nodeType !== dictionary.Opcode.DelegateCall) {
                this.noOtherOpcodes = false;
            }
            if(interactions[i].interaction.nodeType === dictionary.Opcode.DelegateCall) {
                this.foundDelegateCall = true;
            }
        }
    },

    //Test 2) determine delegatecall arguments
    //Arguments are extracted previously as having an "arguments" array with values
    //Access each interaction and their details via interactions[i].interaction (and arguments as arguments[i].condition)
    //Add all delegateCalls into this.delegateCalls array, each one with a msgDataUsed flag
    msgDataUsed : 0,
    determineDelegatecallArguments : function(interactions) {
        for(let i = 0; i < interactions.length; i++) {
            //if we find any delegatecall with problematic arguments like msg.data, it can be considered a problem
            if(interactions[i].interaction.nodeType === dictionary.Opcode.DelegateCall) {
                this.scoreLimit += 1; //count and add based on how many delegateCalls
                for(let arg = 0; arg < interactions[i].interaction.arguments.length; arg++) {
                    let argument = interactions[i].interaction.arguments[arg];
                    if(argument.condition === dictionary.GlobalVar.MsgData) {
                        this.delegateCallMsgData.push(interactions[i].interaction);
                        this.msgDataUsed++;
                    }
                }
            }

            //If the interaction is within an assignment (initialValue)
            if(interactions[i].interaction.initialValue && interactions[i].interaction.initialValue === dictionary.Opcode.DelegateCall) {
                this.scoreLimit += 1; //count and add based on how many delegateCalls
                for(let arg = 0; arg < interactions[i].interaction.arguments.length; arg++) {
                    let argument = interactions[i].interaction.arguments[arg];
                    if(argument.condition === dictionary.GlobalVar.MsgData) {
                        this.delegateCallMsgData.push(interactions[i].interaction);
                        this.msgDataUsed++;
                    }
                }
            }
        }
    },

    /*4 Determine the ordering of each code block's stack. Increment the score by 1 when one violation is found per "interactions-effects" sequence*/
    determineOrderAndScore: function (functionsToTest, isPayable) {
        //Find interactions first before test
        for(let i=0; i < functionsToTest.length; i++) {   
            this.findInteractions(functionsToTest[i].sequence, functionsToTest[i].name);
        }

        //Test 1), noOtherOpcodes = true or false. Only test if the contract is payable
        if(isPayable) {
            this.determineLiquidity(this.interactions); //if no interactions, noOtherOpcodes will remain true
            if(this.noOtherOpcodes) {
                this.score++;
                functionsToTest.dangerousDelegates.messages.push({type: "error", msg: error("This payable contract could be an Ether sink due to no common interactions (delegateCalls don't ensure liquidity).")});
            } else {
                functionsToTest.dangerousDelegates.messages.push({type: "okay", msg: okay("This payable contract has some basic interactions for liquidity (reachability is not determined yet).")});
            } 
        } else {
            functionsToTest.dangerousDelegates.messages.push({type: "okay", msg: okay("This contract is not payable, hence liquidity is not necessary.")});
            this.scoreLimit--; //if the contract is not payable then the first test is unnecessary to be part of the score
        }

        //Test 2) if a number of delegateCalls uses Msg.data, count and add to the score.
        if(this.foundDelegateCall) {
            this.determineDelegatecallArguments(this.interactions);
            if(this.msgDataUsed > 0) {
                this.score += this.msgDataUsed;
                functionsToTest.dangerousDelegates.messages.push({type: "error", msg: error("This contract contains delegateCalls with a msg.data argument. Avoid using to prevent unintentionally calling other function signatures.\n")});
            } else {
                functionsToTest.dangerousDelegates.messages.push({type: "okay", msg: okay("This contract doesn't use msg.data as an argument for any delegateCalls.")});
            }
        } else {
            functionsToTest.dangerousDelegates.messages.push({type: "okay", msg: okay("This contract doesn't use any delegateCalls.")});
        }

        functionsToTest.dangerousDelegates.score = this.score;
        functionsToTest.dangerousDelegates.scoreLimit = this.scoreLimit;
        functionsToTest.dangerousDelegates.noOtherOpcodes = this.noOtherOpcodes;
        functionsToTest.dangerousDelegates.delegateCallMsgData = this.delegateCallMsgData;
    },  

    //Main function to be called by proof-read.js to test
    test: function(contractAST, isPayable) {
        let functionsToTest = JSON.parse(JSON.stringify(contractAST.functions)); //clone to prevent shallow copy
        functionsToTest.dangerousDelegates = {};
        functionsToTest.dangerousDelegates.messages = [];
        //Reset for the next test
        this.interactions = [];
        this.delegateCallMsgData = [];
        this.msgDataUsed = 0;
        this.score = 0;
        this.scoreLimit = 1;
        this.noOtherOpcodes = true;
        //Test the all functions in the contract for any dangerous delegate practices
        this.determineOrderAndScore(functionsToTest, isPayable);
        //assign the results to the given functionAST object from proof-read.js
        contractAST.dangerousDelegates = functionsToTest.dangerousDelegates;
    }
};