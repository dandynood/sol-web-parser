/*jshint esversion: 9*/
/* eslint-env es6 */
var dictionary = require("../dictionary.json");
const chalk = require('chalk');
const okay = chalk.green;
const error = chalk.red;
/*
    Mishandled Exceptions are when:
    1) No error handling is done for Solidity opcodes (like call() or send()) where their success value is not assigned
    2) When the assigned success value is never used in check after the interaction

    From this simple design flaw of lacklustre error handling, we need to determine:
    1) if a Boolean variable was used in the assignment from an interaction
    2) if the same Boolean variable is found in a check later (and if the check block is not empty)

    However from as the case of transfer(), these exceptions cannot be caught at all hence they can be left out.
    Other checks can be if a try/catch is used on a external function call or contract creation to which the catch block must at least not be empty

    Expected results:
    scoreLimit = number of interactions found in the contract.
    score = number of problematic interactions in the contract. Score increments whenever it fails Test 1) Xor Test 2).
    interactions = [array of interactions found, each marked with hasChecks and hasSuccessValue boolean values].
    messages = array of formatted console messages using chalk. Comes with a type for later formatting in the browser view
*/
module.exports = {
    //Score that increments base on issues found
    score:  0,
    scoreLimit: 0,
    /*1. Define checks-effects-interactions*/
    order: {
        effects: [
            dictionary.Statements.Assignment,
            dictionary.Statements.VariableDeclarationStatement
        ],
        interactions: [
            dictionary.Opcode.Call,
            dictionary.Opcode.Send,
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
    /*2 Define a series of necessary flags to use */
    interactions: [],

    //Test 1) Find if the interaction's success value is assigned 
    findInteractionSuccessValue: function (sequence) {
        for(let i = 0; i < sequence.length; i++) {
            let statement = {};
            //Find an interaction and mark it's place in the sequence for later tests (find checks after that interaction)
            if(this.order.interactions.includes(sequence[i].nodeType)) { 
                statement.interaction = sequence[i]; 
                statement.hasSuccessValue = false;
                this.interactions.push(statement);
            }
            //check if the interaction exist in an assignment statement, by right it should have error handling later
            if(sequence[i].initialValue) {
                if(this.order.interactions.includes(sequence[i].initialValue)) { 
                    statement.interaction = sequence[i]; statement.hasSuccessValue = true;
                    statement.codeBlock = sequence;
                    statement.varID = sequence[i].id;
                    statement.statementNum = i; //This interaction is statement N within its respective code block
                    this.interactions.push(statement);
                }
            }
            //if the interaction is an argument for a check like if or require, this can be considered fully handled
            if(this.order.checks.includes(sequence[i].nodeType)){
                let conditions = sequence[i].conditions;
                for(let cond = 0; cond < conditions.length; cond++){
                    if((conditions[cond].condition && this.order.interactions.includes(conditions[cond].condition)) || 
                    (conditions[cond].left && this.order.interactions.includes(conditions[cond].left))) {
                        statement.interaction = sequence[i]; 
                        statement.hasChecks = true;
                        statement.hasSuccessValue = true;
                        this.interactions.push(statement);
                    }
                }
            }

            if(sequence[i].subBlock) {
                if(sequence[i].subBlock.length !== 0) {
                    this.findInteractionSuccessValue(sequence[i].subBlock);
                }
            }
            //if any ifstatements are found via truebody, unpack
            if(sequence[i].trueBody){
                this.findInteractionSuccessValue(sequence[i].trueBody);
                if(sequence[i].falseBody) {
                    let elseIf = [sequence[i].falseBody];
                    this.findInteractionSuccessValue(elseIf);
                }
            }
        }
    },

    //Test 2) each sequence is the code block where the interaction comes from. This checks if the success values is used within a check after the interaction
    findSuccessValueInCheck : function(sequence, varSuccessID, statementNum, interactionNum) {
        for(let i = statementNum; i < sequence.length; i++) {
            if(this.order.checks.includes(sequence[i].nodeType) && sequence[i].conditions) {
                let conditions = sequence[i].conditions;
                for(let cond = 0; cond < conditions.length; cond++){
                    if((conditions[cond].conditionVarID && conditions[cond].conditionVarID === varSuccessID) || 
                    (conditions[cond].leftVarID && conditions[cond].leftVarID === varSuccessID)) {
                        this.interactions[interactionNum].hasChecks = true;
                        break;
                    }
                }
            }

            if(sequence[i].subBlock) {
                if(sequence[i].subBlock.length !== 0) {
                    this.findInteractionSuccessValue(sequence[i].subBlock);
                }
            }
            //if any ifstatements are found via truebody, unpack
            if(sequence[i].trueBody){
                this.findInteractionSuccessValue(sequence[i].trueBody);
                if(sequence[i].falseBody) {
                    let elseIf = [sequence[i].falseBody];
                    this.findInteractionSuccessValue(elseIf);
                }
            }
        }
    },  

    determineAndScore: function (functionToTest) {
        functionToTest.mishandledErrors = {};
        functionToTest.mishandledErrors.messages = [];
        //Test 1), also gets saves all interactions for the 2nd test
        this.findInteractionSuccessValue(functionToTest.sequence);
        //Score limit is equal to the total amount of interactions found in the contract
        //Hence the score itself is how many of those interactions are problematic
        this.scoreLimit = this.interactions.length; 
        //Skip if there was no interactions found
        if(this.interactions.length !== 0) {
            for(let i = 0; i < this.interactions.length; i++) {
                if(!this.interactions[i].hasSuccessValue) {
                    this.score++; //if each interaction's success value is not assigned, increment
                } else if(this.interactions[i].hasSuccessValue && !this.interactions[i].hasChecks) {
                    //Test 2) if the following interactions that have assigned a success value
                    this.findSuccessValueInCheck(this.interactions[i].codeBlock, this.interactions[i].varID, this.interactions[i].statementNum, i);
                }
            }

            for(let i = 0; i < this.interactions.length; i++ ) {
                if(this.interactions[i].hasSuccessValue && !this.interactions[i].hasChecks) {
                    this.score++; //if each interaction's success value is not being checked, increment
                    //Don't count interactions with no assignment
                } 
            }

            //POSITIVE RESULT
            //Now create the result message. Either message 1 OR 2 is written
            let message1Done = false, message2Done = false;
            for(let i = 0; i < this.interactions.length; i++ ) {
                if(!this.interactions[i].hasSuccessValue && !message1Done) {
                    functionToTest.mishandledErrors.messages.push({type: "error", msg: error("This function has some interactions that do not retreive their success values.")});
                    message1Done = true;
                }

                if((this.interactions[i].hasSuccessValue && !this.interactions[i].hasChecks) && !message2Done) {
                    functionToTest.mishandledErrors.messages.push({type: "error", msg: error("This function has some interactions where their success values are not being checked.")});
                    message2Done = true;
                }
            }
            //NEGATIVE RESULT
            //By right if no problems are found in both, print out a positive result
            if(!message1Done && !message2Done) { functionToTest.mishandledErrors.messages.push({type: "okay", msg: okay("All interactions' success values are assigned and checked.")}); }

        } else {
            functionToTest.mishandledErrors.messages.push({type: "okay", msg: okay("No interactions found in this function.")});
        }
        functionToTest.mishandledErrors.score = this.score;
        functionToTest.mishandledErrors.scoreLimit = this.scoreLimit;
        functionToTest.mishandledErrors.interactions = this.interactions;
    },

    //Main function to be called by proof-read.js to test
    test: function(functionAST) {
        let functionToTest = {};
        let functionASTClone = JSON.parse(JSON.stringify(functionAST)); //clone to prevent shallow copy
        for(let i=0;i<functionASTClone.length;i++){
            //Reset for the next function
            this.score = 0;
            this.scoreLimit = 0;
            this.interactions = [];
            functionToTest = functionASTClone[i];
            //Test the next function for mishandled errors
            this.determineAndScore(functionToTest);
            //assign the results to the given functionAST object from proof-read.js
            functionAST[i].mishandledErrors = functionToTest.mishandledErrors;
        }
    }
};