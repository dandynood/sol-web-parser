/*jshint esversion: 9*/
/* eslint-env es6 */
let dictionary = require("../dictionary.json");
const chalk = require('chalk');
let indexHelper = require("../indexHelper.js");
const okay = chalk.green;
const error = chalk.red;
/*  Unsecured Calls V1, Last updated: 2/1/2021
    Unsecured Calls are Solidity interactions such as call(), send() or similar which
    1) Are not secured with a locking mechanism (needs a boolean effect changed before the interaction and a check if locked)
    2) Have critical effects together after an interaction (though subjective, it is perferable to have effects before the interaction to ensure reachiblity)

    Because of the lack of context a code parser has to determine what are "critical effects" and what "lock" is being used, we assume the following tests
    Test 1) Find if an interaction is contained within a check block (like if statements or covered by require statements)
    Test 2) Find out if those check's conditions are changed before the interaction (i.e. in between the check covering the interaction and the interaction itself).

    Expected results:
    scoreLimit = n, relating to the number of interactions in a function
    score = increases as more of those checks are true. Score increments whenever Test 1) or Test 2) fails. 
    2 boolean values noChecksBefore, and effectsCheckedandChanged for messages
    messages = array of formatted console messages using chalk. Comes with a type for later formatting in the browser view
    
    Note: An interaction in this test module can fail Test 1) XOR Test 2). If an interaction passes Test 1) they need to go through Test 2).
    In other words, the score could only increment once per interaction.

    Essentially, the code needs to be the following to be pass the tests for example:
    1. if(sent) { sent = x; ... <interaction> ... }
    2. require(sent); sent = x; ... <interaction> ...
*/
module.exports = {

    //Score that increments base on issues found
    score:  0,
    scoreLimit: 2,
    /*1. Define checks-effects-interaction reference*/
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
            dictionary.Opcode.CallCode
        ],
        checks: [
            dictionary.Statements.IfStatement,
            dictionary.Statements.ElseIfStatement
        ]
    },
    /*2 Define a series of necessary fields to use */
    //For Test 1)
    interactions: [],
    noChecksBefore: false,
    //For Test 2)
    effectsCheckedandChanged : true,

    //Test 1) Get all interactions in the function first for testing "checks before interactions"
    //if an interaction is found, save it and set the properties of whether it is "within a check", its parent check if any, and the statements before it as "codeBlock"
    //By right an interaction should always have a withinCheck = true, and parentCheck to start
    getAllInteractions : function(sequence, withinCheck=false, parentChecks=[]) {
        for(let i = 0; i < sequence.length; i++) {
            let statement = {};
            //If the interaction is found, set the following and the codeBlock (statements before the interaction)
            if(this.order.interactions.includes(sequence[i].nodeType)) { 
                statement.interaction = sequence[i];
                statement.withinCheck = withinCheck;
                statement.parentChecks = JSON.parse(JSON.stringify(parentChecks));
                this.interactions.push(statement);
            }

            //if the interaction is within an assignment/variable declaration 
            if(sequence[i].initialValue) {
                for(let dec=0;dec<sequence[i].initialValue.length; dec++) {
                    if(this.order.interactions.includes(sequence[i].initialValue[dec].condition)) { 
                        statement.interaction = sequence[i];
                        statement.withinCheck = withinCheck;
                        statement.parentChecks = JSON.parse(JSON.stringify(parentChecks));
                        this.interactions.push(statement);
                    }
                }
            }
            //check if the interaction is an argument for a if or return
            if(this.order.checks.includes(sequence[i].nodeType) || sequence[i].nodeType === dictionary.Statements.Return || sequence[i].nodeType === dictionary.Opcode.Require){
                let conditions = sequence[i].conditions;
                for(let cond = 0; cond < conditions.length; cond++){
                    //if an interaction is found in the check's conditions..
                    if((conditions[cond].condition && this.order.interactions.includes(conditions[cond].condition)) || 
                    (conditions[cond].left && this.order.interactions.includes(conditions[cond].left)) ||
                    (conditions[cond].right && this.order.interactions.includes(conditions[cond].right))) {
                        statement.interaction = sequence[i]; 
                        statement.withinCheck = withinCheck;
                        statement.parentChecks = JSON.parse(JSON.stringify(parentChecks));
                        this.interactions.push(statement);
                        break;
                    }
                }
                //if it is a require, set the following for the next statements below
                if(sequence[i].nodeType === dictionary.Opcode.Require) {
                    withinCheck = true;
                    parentCheck = sequence[i];
                    parentChecks.push(sequence[i]);
                } 
            }           

            if(sequence[i].subBlock) {
                if(sequence[i].subBlock.length !== 0) {
                    this.getAllInteractions(sequence[i].subBlock, withinCheck, JSON.parse(JSON.stringify(parentChecks)));
                }
            }
            //if any ifstatements are found via truebody, unpack
            if(sequence[i].trueBody) {
                //unpack the truebody, which the body is considered "within the check". Also mark this sequence as a parentCheck
                //Only count for If and ElseIF
                if(this.order.checks.includes(sequence[i].nodeType)) {
                    parentChecks.push(sequence[i]); //push in for this next level of traversal
                    this.getAllInteractions(sequence[i].trueBody, true, JSON.parse(JSON.stringify(parentChecks)));
                    parentChecks.pop(); //after traversal, pop out as the ones outside the truebody aren't covered
                //else if this is an Else statement
                } else {
                    this.getAllInteractions(sequence[i].trueBody, withinCheck, JSON.parse(JSON.stringify(parentChecks)));
                }
            }
        }
    },
    
    //Test 2) More complex test to find updates to lock conditions in between an interaction and its parent check (require or the preceeding If statement)
    //Some interactions may be covered by multiple checks but not all of them are locks. 
    //Hence, we imply that as long as ONE check's conditions is updated prior to the interaction, that it is acting as a lock.
    findChecksUpdatesBeforeInteractionV3 : function (sequence, check, interactionIndex) {
        //the sequence is inbetween the index of the parent check and the interaction.
        for(let i = 0; i < sequence.length; i++) {
            //if an assignment is found, check if it updates the check's conditions
            if(sequence[i].nodeType === dictionary.Statements.Assignment) {
                //see if this effect changes the value of the check's condition
                for(let asgn=0; asgn < sequence[i].assignments.length; asgn++) {
                    let assignment = sequence[i].assignments[asgn];
                    for(let x=0;x<check.conditions.length;x++) {
                        if((check.conditions[x].leftVarID || check.conditions[x].conditionVarID || check.conditions[x].rightVarID) && 
                        (assignment.varID === check.conditions[x].leftVarID || 
                        assignment.varID === check.conditions[x].conditionVarID || 
                        assignment.varID === check.conditions[x].rightVarID)) {
                            check.noUpdateFound = false;
                        }
                    }   
                }             
            }

            if(sequence[i].subBlock) {
                if(sequence[i].subBlock.length !== 0) {
                    this.findChecksUpdatesBeforeInteractionV3(sequence[i].subBlock, check);
                }
            }
            //if any ifstatements are found via truebody, unpack. It will be noted if this check is a potential lock or not
            if(sequence[i].trueBody){
                this.findChecksUpdatesBeforeInteractionV3(sequence[i].trueBody, check);
            }
        }
    },
    
    /*4 Determine the ordering of each code block's stack. Increment the score by 1 when one violation is found per "interactions-effects" sequence*/
    determineOrderAndScore: function (functionToTest) {
        functionToTest.unsecuredCalls = {};
        functionToTest.unsecuredCalls.messages = [];
        functionToTest.unsecuredCalls.locations = [];

        //Retrieve all interactions first (including if they are within a check, and their parent check if any)
        //Test 1) Test for "Checks before interactions"
        this.getAllInteractions(functionToTest.sequence);
        this.scoreLimit = this.interactions.length; 

        if(functionToTest.name === "hashing") {
            indexHelper.test(functionToTest.sequence);
        }

        if(this.interactions.length > 0) {
            for(let i=0; i < this.interactions.length; i++) {
                //If Test 1 fails, increment the score and skip test 2 for this interaction
                if(!this.interactions[i].withinCheck) {
                    this.score++;
                    this.noChecksBefore = true;
                //If test 1 succeeds, proceed with Test 2) for this interaction
                } else if(this.interactions[i].withinCheck) {
                    this.interactions[i].effectsCheckedandChanged = false;
                    //Test 2) Check if the statements before the interactions (within the "code block" property) update the check's conditions.
                    //only test for interactions that within a check
                    for(let y=0; y < this.interactions[i].parentChecks.length; y++) {
                        //Get the sequence in between parentChecks[y] position and interaction[i]'s position
                        let inBetween = indexHelper.inBetween(functionToTest.sequence, this.interactions[i].parentChecks[y].indexNum, this.interactions[i].interaction.indexNum);
                        this.interactions[i].parentChecks[y].noUpdateFound = true;
                        //Test 2) By right if an update is found in the interaction's parent check, then noUpdateFound = false.
                        this.findChecksUpdatesBeforeInteractionV3(inBetween, this.interactions[i].parentChecks[y]);
                        //If just one interaction's parent check is found to update, then we can consider this function somewhat locked
                        if(!this.interactions[i].parentChecks[y].noUpdateFound) {
                            this.interactions[i].effectsCheckedandChanged = true;
                        }
                    }

                    if(!this.interactions[i].effectsCheckedandChanged) {
                        this.score++;
                        this.effectsCheckedandChanged = false;
                    }
                }
            }

            //if one interaction in the function is not covered in a check
            if(this.noChecksBefore) {
                functionToTest.unsecuredCalls.messages.push({type: "error", msg: error("Some interaction(s) is not covered by a check, making it unsecure.")});
            } else {
                functionToTest.unsecuredCalls.messages.push({type: "okay", msg: okay("All interactions are covered by a check.")});
            }
            //if no effects has changed any parent check's lock before interaction, it's problematic
            if(!this.effectsCheckedandChanged) {
                //this.score++;
                functionToTest.unsecuredCalls.messages.push({type: "error", msg: error("This function has some interaction(s) inside a check, but conditions are not updated before the interaction (not a viable lock).")});
            } else if(!this.noChecksBefore && this.effectsCheckedandChanged) {
                functionToTest.unsecuredCalls.messages.push({type: "okay", msg: okay("All interactions are seemingly secured, with their check conditions updated before it.")});
            }    
        } else {
            functionToTest.unsecuredCalls.messages.push({type: "okay", msg: okay("No interactions found in this function.")});
        } 
    
        functionToTest.unsecuredCalls.noChecksBefore = this.noChecksBefore;
        functionToTest.unsecuredCalls.effectsCheckedandChanged = this.effectsCheckedandChanged;
        functionToTest.unsecuredCalls.score = this.score;
        functionToTest.unsecuredCalls.scoreLimit = this.scoreLimit;
    },  

    //Main function to be called by proof-read.js to test
    test: function(functionAST) {
        let functionToTest = {};
        let functionASTClone = JSON.parse(JSON.stringify(functionAST)); //clone to prevent shallow copy
        for(let i=0;i<functionASTClone.length;i++){
            //Reset for the next function
            this.score = 0;
            this.scoreLimit = 2;
            functionToTest = functionASTClone[i];
            //test flags
            this.noChecksBefore = false;
            this.effectsCheckedandChanged = true;

            //necessary fields and flags
            this.interactions = [];

            //Test the next function for unsecured calls
            this.determineOrderAndScore(functionToTest);
            //assign the results to the given functionAST object from proof-read.js
            functionAST[i].unsecuredCalls = functionToTest.unsecuredCalls;
        }
    }
};