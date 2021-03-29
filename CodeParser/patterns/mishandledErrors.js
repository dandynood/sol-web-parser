/*jshint esversion: 9*/
/* eslint-env es6 */
var dictionary = require("../dictionary.json");
const chalk = require('chalk');
const indexHelper = require("../indexHelper");
const okay = chalk.green;
const error = chalk.red;
/*  Mishandled Exceptions V1, Last updated: 29/12/2020
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
    /*1. Define checks-effects-interactions reference*/
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
        ],
        ifs: [
            dictionary.Statements.IfStatement,
            dictionary.Statements.ElseIfStatement,
            dictionary.Statements.ElseStatement            
        ]
    },
    /*2 Define a series of necessary fields to use */
    interactions: [],
    noSuccessValues: 0,
    noChecks: 0,
    noBodies: 0,

    //Test 1) Find if the interaction's success value is assigned 
    //If an interaction is found with success values, we need to test if the success values are checked after the interaction
    findInteractionSuccessValue: function (sequence) {
        for(let i = 0; i < sequence.length; i++) {
            let statement = {};
            //If we find just an interaction alone, it implies it's not being handled
            if(this.order.interactions.includes(sequence[i].nodeType)) { 
                statement.interaction = sequence[i]; 
                statement.hasSuccessValue = false;
                this.interactions.push(statement);
            }
            //check if the interaction exist in an assignment statement, by right it should have error handling later
            if(this.order.effects.includes(sequence[i].nodeType)) {
                for(let ii=0;ii<sequence[i].initialValue.length; ii++) {
                    if(this.order.interactions.includes(sequence[i].initialValue[ii].condition)) { 
                        statement.interaction = sequence[i]; 
                        let dec = 0;
                        if((sequence[i].declarations && sequence[i].declarations.length > 1) || (sequence[i].assignemnts && sequence[i].assignments.length > 1)) {
                            dec = ii;
                        }
                        //if variable declaration
                        if((sequence[i].declarations && sequence[i].declarations[dec].type === "bool")) {
                            statement.hasSuccessValue = true;
                            statement.hasChecks = false;
                            statement.varID = sequence[i].declarations[dec].varID;
                        //if assignment
                        } else if((sequence[i].assignments && sequence[i].assignments[dec].type === "bool")) {
                            statement.hasSuccessValue = true;
                            statement.hasChecks = false;
                            statement.varID = sequence[i].assignments[dec].varID;
                        } else {
                            statement.hasSuccessValue = false;
                        }
                        this.interactions.push(statement);
                    }
                }
            }
            //if the interaction is an argument for a check like if or require, this can be considered fully handled
            if(this.order.checks.includes(sequence[i].nodeType)){
                let conditions = sequence[i].conditions;
                for(let cond = 0; cond < conditions.length; cond++){
                    if((conditions[cond].condition && this.order.interactions.includes(conditions[cond].condition)) || 
                    (conditions[cond].left && this.order.interactions.includes(conditions[cond].left)) ||
                    (conditions[cond].right && this.order.interactions.includes(conditions[cond].right))) {
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
            }
        }
    },

    //Test 2) Find after the interaction if any checks exist that uses the success flag of the interaction
    findSuccessValueInCheckV3 : function (sequence, interaction) {
        for(let i = 0; i < sequence.length; i++) {
            if(this.order.checks.includes(sequence[i].nodeType) && sequence[i].conditions) {
                let conditions = sequence[i].conditions;
                for(let cond = 0; cond < conditions.length; cond++){
                    //check if the conditions use the interaction's success value. 
                    if((conditions[cond].conditionVarID && conditions[cond].conditionVarID === interaction.varID) || 
                    (conditions[cond].leftVarID && conditions[cond].leftVarID === interaction.varID) ||
                    (conditions[cond].rightVarID && conditions[cond].rightVarID === interaction.varID)) {
                        interaction.hasChecks = true;
                        if(this.order.ifs.includes(sequence[i].nodeType) && sequence[i].trueBody.length === 0) {
                            interaction.hasNoBody = true;
                        }
                        break;
                    }
                }
            }

            if(sequence[i].subBlock) {
                if(sequence[i].subBlock.length !== 0) {
                    this.findSuccessValueInCheckV3(sequence[i].subBlock, interaction);
                }
            }
            //if any ifstatements are found via truebody, unpack
            if(sequence[i].trueBody){
                this.findSuccessValueInCheckV3(sequence[i].trueBody, interaction);
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
        let errors = false;
        //Skip if there was no interactions found
        if(this.interactions.length !== 0) {
            for(let i = 0; i < this.interactions.length; i++) {
                if(!this.interactions[i].hasSuccessValue) {
                    this.noSuccessValues++;
                    errors = true;
                    this.score++; //if each interaction's success value is not assigned, increment
                } else if(this.interactions[i].hasSuccessValue && !this.interactions[i].hasChecks) {
                    //Test 2) if the following interactions that have assigned a success value
                    //Traverse the sequence and only consider checks using interaction[i]'s success value AFTER it finds interaction[i]
                    let startFrom = indexHelper.startOn(functionToTest.sequence, this.interactions[i].interaction.indexNum);
                    this.foundInteraction = false;
                    this.findSuccessValueInCheckV3(startFrom, this.interactions[i]);
                }
            }

            for(let i = 0; i < this.interactions.length; i++ ) {
                if(this.interactions[i].hasSuccessValue && (!this.interactions[i].hasChecks || this.interactions[i].hasNoBody)) {
                    if(!this.interactions[i].hasChecks) this.noChecks++;
                    if(this.interactions[i].hasNoBody) this.noBodies++;
                    errors = true;
                    this.score++; //if the interaction's success value is not being checked, or the true body of the check is empty, increment
                    //Don't count interactions with no assignment
                } 
            }

            //POSITIVE RESULT
            //Amend messages depending on the interaction's failed test case
            if(this.noSuccessValues > 0) {
                functionToTest.mishandledErrors.messages.push({type: "error", msg: error("This function has "+this.noSuccessValues+" interactions that do not retreive their success values.")});
            }

            if(this.noChecks > 0) {
                functionToTest.mishandledErrors.messages.push({type: "error", msg: error("This function has "+this.noChecks+" some interactions where their success values are not being checked after.")});
            }

            if(this.noBodies > 0) {
                functionToTest.mishandledErrors.messages.push({type: "error", msg: error("This function has "+this.noBodies+" checked interactions (using ifs) but leads to nothing.")});
            }

            //NEGATIVE RESULT
            //By right if no problems are found in both, print out a positive result
            if(!errors) { 
                functionToTest.mishandledErrors.messages.push({type: "okay", msg: okay("All interactions' success values are assigned and seemingly checked after.")}); 
            }
        } else {
            functionToTest.mishandledErrors.messages.push({type: "okay", msg: okay("No non-transfer() interactions found in this function.")});
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
            this.noChecks = 0; 
            this.noSuccessValues = 0; 
            this.noBodies = 0;
            functionToTest = functionASTClone[i];
            //Test the next function for mishandled errors
            this.determineAndScore(functionToTest);
            //assign the results to the given functionAST object from proof-read.js
            functionAST[i].mishandledErrors = functionToTest.mishandledErrors;
        }
    }
};