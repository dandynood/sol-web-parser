/*jshint esversion: 9*/
/* eslint-env es6 */
var dictionary = require("../dictionary.json");
const chalk = require('chalk');
const okay = chalk.green;
const error = chalk.red;
const warning = chalk.yellow;
/*  Over Dependency V1, Last updated: 29/12/2020
    Over dependency refers to the over reliance on states, variables, or values that are outside the control sphere and are determined there
    These include:
    1) Block.timestamp and block.number in critical effects (block state dependency)
    3) using blockhash() with 1)
    4) using tx.origin (especially in a check) which is a Transaction State Dependency

    Because of the context-dependent nature of this design flaw, it can be hard to pinpoint with accuracy if a function is over-dependent.
    Thus, we can make the following assumptions:
    1) If a global var is used in a assignment that is part of a math operation (multiple conditions)
    2) If the global var or a assigned variable is used within a check that leads to an interaction
    3) If the global var was used as an argument for "return" statements

    Expected results:
    scoreLimit = 3, relating to 3 boolean checks (foundAssignments, foundChecksWithGlobalVar, foundReturnVariable).
    score = increases as more of those checks are true. Score increments whenever those checks are marked true in Test 1), Test 2) and Test 3) respectfully.
    3 boolean values, foundAssignments, foundChecksWithGlobalVar, and foundReturnVariable.
    messages = array of formatted console messages using chalk. Comes with a type for later formatting in the browser view
*/
module.exports = {

    //Score that increments base on issues found
    score:  0,
    scoreLimit: 3,
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
            dictionary.Opcode.DelegateCall,         
            dictionary.Statements.FunctionCall
        ],
        checks: [
            dictionary.Opcode.Require,
            dictionary.Statements.IfStatement,
            dictionary.Statements.ElseIfStatement
        ],
        globalVar: [
            dictionary.GlobalVar.BlockTimestamp,
            dictionary.GlobalVar.BlockNumber,
            dictionary.GlobalVar.Now, //please note: deprecated since 0.7, block.timestamp is now the only alias for this property
            dictionary.GlobalVar.Block,
            dictionary.GlobalVar.TxOrigin
        ]
    },

    assignmentIDs : [],
    assignments : [],
    checks: [],
    returns: [],

    //Test 1) This checks for any variable assignments of the globalVars defined. 
    //This is used later in Test 2 and 3 to see if these variables based on the global vars are being used
    foundAssignments : false,
    findAssignments: function (sequence) {
        for(let i = 0; i < sequence.length; i++) {
            let assignment = {};
            //check an assignment or variable declaration is using some kind of global var
            if(sequence[i].initialValue) {
                //if the global var is used in some kind of operation (like a math one)
                for(let ii=0; ii < sequence[i].initialValue.length; ii++){
                    let y = 0;
                    if((sequence[i].declarations && sequence[i].declarations.length > 1) || (sequence[i].assignments && sequence[i].assignments.length > 1)) {
                        y = ii;
                    }
                    if(this.order.globalVar.includes(sequence[i].initialValue[ii].left) || 
                    this.order.globalVar.includes(sequence[i].initialValue[ii].right) ||
                    this.order.globalVar.includes(sequence[i].initialValue[ii].condition)) {
                        this.foundAssignments = true;
                        //if this variable being assigned is not on the assignmentID list
                        if(sequence[i].declarations && !this.assignmentIDs.includes(sequence[i].declarations[y].varID)) {
                            assignment.name = sequence[i].declarations[y].name; 
                            assignment.varID = sequence[i].declarations[y].varID;
                            this.assignments.push(assignment);
                            this.assignmentIDs.push(assignment.varID);
                        } else if (sequence[i].assignments && !this.assignmentIDs.includes(sequence[i].assignments[y].varID)) {
                            assignment.name = sequence[i].assignments[y].name; 
                            assignment.varID = sequence[i].assignments[y].varID;
                            this.assignments.push(assignment);
                            this.assignmentIDs.push(assignment.varID);                            
                        }
                    //else if this assignment is using another variable that was assigned the global var, save it too
                    /* } else if(this.assignmentIDs.includes(sequence[i].initialValue[ii].leftVarID) ||
                    this.assignmentIDs.includes(sequence[i].initialValue[ii].rightVarID) || 
                    this.assignmentIDs.includes(sequence[i].initialValue[ii].conditionVarID)) {
                        //if this variable being assigned is not on the assignmentID list
                        if(sequence[i].declarations && !this.assignmentIDs.includes(sequence[i].declarations[y].varID)) {
                            assignment.name = sequence[i].declarations[y].name; 
                            assignment.varID = sequence[i].declarations[y].varID;
                            this.assignments.push(assignment);
                            this.assignmentIDs.push(assignment.varID);
                        } else if (sequence[i].assignments && !this.assignmentIDs.includes(sequence[i].assignments[y].varID)) {
                            assignment.name = sequence[i].assignments[y].name; 
                            assignment.varID = sequence[i].assignments[y].varID;
                            this.assignmentIDs.push(assignment.varID);                            
                        } */
                    //if the condition was a functionCall it would have arguments that need to be check (like typeConversions or Blockhash)
                    } else if (sequence[i].initialValue[ii].arguments) {
                        this.flag = false;
                        this.unpackFunctionArguments(sequence[i].initialValue[ii].arguments);
                        if(this.flag) { 
                            this.foundAssignments = this.flag;
                            if(sequence[i].declarations && !this.assignmentIDs.includes(sequence[i].declarations[y].varID)) {
                                assignment.name = sequence[i].declarations[y].name; 
                                assignment.varID = sequence[i].declarations[y].varID;
                                this.assignments.push(assignment);
                                this.assignmentIDs.push(assignment.varID);
                            } else if (sequence[i].assignments && !this.assignmentIDs.includes(sequence[i].assignments[y].varID)) {
                                assignment.name = sequence[i].assignments[y].name; 
                                assignment.varID = sequence[i].assignments[y].varID;
                                this.assignments.push(assignment);
                                this.assignmentIDs.push(assignment.varID);                            
                            }
                        }
                    }
                }
            }

            if(sequence[i].subBlock) {
                if(sequence[i].subBlock.length !== 0) {
                    this.findAssignments(sequence[i].subBlock);
                }
            }
            //if any ifstatements are found via truebody, unpack
            if(sequence[i].trueBody){
                this.findAssignments(sequence[i].trueBody);
            }
        }
    },

    //Test 2) checks if any check statements uses block.timestamp (or now), block.number and tx.origin, or variables assigned with global vars
    findChecksWithGlobalStates: function (sequence) {
        for(let i = 0; i < sequence.length; i++) {
            if(this.order.checks.includes(sequence[i].nodeType)) {
                let check = sequence[i];
                for(let y=0; y < check.conditions.length; y++){
                    //direct checks. If found to have any global vars, unpack the body of this to find interactions
                    //left and right e.g. <global var> == <value> or <value> == <global var>
                    if(this.order.globalVar.includes(check.conditions[y].left) || 
                    this.order.globalVar.includes(check.conditions[y].right)) {
                        this.foundChecksWithGlobalVar = true;
                        this.checks.push(sequence[i]);
                        break;
                    //assignment checks. If found to any have global vars, unpack the body of this to find interactions
                    } else if (this.assignmentIDs.includes(check.conditions[y].leftVarID) || 
                        this.assignmentIDs.includes(check.conditions[y].rightVarID)) {
                        this.foundChecksWithGlobalVar = true;
                        this.checks.push(sequence[i]);
                        break;
                    }
                }
            }
            if(sequence[i].subBlock) {
                if(sequence[i].subBlock.length !== 0) {
                    this.findChecksWithGlobalStates(sequence[i].subBlock);
                }
            }
            //if any ifstatements are found via truebody, unpack
            if(sequence[i].trueBody){
                this.findChecksWithGlobalStates(sequence[i].trueBody);
            }
        }        
    },

    //Test 3) If global variables are returned in a function which may or may not be manipulated prior
    foundReturnVariable : false, 
    findReturns : function (sequence) {
        for(let i = 0; i < sequence.length; i++) {
            //If we found a return, check if it is returning one of the global variables
            if(sequence[i].nodeType === dictionary.Statements.Return) {
                for(let y=0; y < sequence[i].conditions.length; y++) {
                    //if this is returning a global variable
                    if(this.order.globalVar.includes(sequence[i].conditions[y].condition) || 
                    this.order.globalVar.includes(sequence[i].conditions[y].left) || 
                    this.order.globalVar.includes(sequence[i].conditions[y].right)) {
                        this.foundReturnVariable = true;
                        this.returns.push(sequence[i]);
                    //if this is returning an assignment that has been assigned with some global var
                    } else if (this.assignmentIDs.includes(sequence[i].conditions[y].conditionVarID) || 
                    this.assignmentIDs.includes(sequence[i].conditions[y].leftVarID) || 
                    this.assignmentIDs.includes(sequence[i].conditions[y].rightVarID)) { 
                        this.foundReturnVariable = true;
                        this.returns.push(sequence[i]);
                    //if the condition was a functionCall it would have arguments that need to be check (like typeConversions or Blockhash)
                    } else if (sequence[i].conditions[y].arguments) {
                        this.flag = false;
                        this.unpackFunctionArguments(sequence[i].conditions[y].arguments);
                        if(this.flag) {
                            this.returns.push(sequence[i]);
                        }
                        this.foundReturnVariable = this.flag;
                    }
                }
            }

            if(sequence[i].subBlock) {
                if(sequence[i].subBlock.length !== 0) {
                    this.findReturns(sequence[i].subBlock);
                }
            }
            //if any ifstatements are found via truebody, unpack
            if(sequence[i].trueBody){
                this.findReturns(sequence[i].trueBody);
            }
        }
    },

    //Use for Test 3)
    flag : false,
    unpackFunctionArguments : function(arguments) {
        for(let i=0; i < arguments.length; i++) {
            if(this.order.globalVar.includes(arguments[i].condition) || 
                this.order.globalVar.includes(arguments[i].left) || 
                this.order.globalVar.includes(arguments[i].right)) {
                    this.flag = true;
            } else if (this.assignmentIDs.includes(arguments[i].conditionVarID) || 
                this.assignmentIDs.includes(arguments[i].leftVarID) || 
                this.assignmentIDs.includes(arguments[i].rightVarID)) { 
                this.foundReturnVariable = true;
            }

            if (arguments[i].arguments) {
                //recurse
                this.unpackFunctionArguments(arguments[i].arguments);
            }
            
        }
    },

    //Test 4) checks if any function calls uses block.timestamp (or now), block.number and tx.origin, or variables assigned with global vars
    foundFunctionCall : false,
    findFunctionCallsWithGlobalStates: function (sequence) {
        for(let i = 0; i < sequence.length; i++) {
            if(sequence[i].nodeType === dictionary.Statements.FunctionCall && sequence[i].arguments.length > 0) {
                this.flag = false;
                this.unpackFunctionArguments(sequence[i].arguments);
                this.foundFunctionCall = this.flag;     
            }
            if(sequence[i].subBlock) {
                if(sequence[i].subBlock.length !== 0) {
                    this.findFunctionCallsWithGlobalStates(sequence[i].subBlock);
                }
            }
            //if any ifstatements are found via truebody, unpack
            if(sequence[i].trueBody){
                this.findFunctionCallsWithGlobalStates(sequence[i].trueBody);
            }
        }        
    },

    determineAndScore: function (functionToTest) {
        functionToTest.overDependency = {};
        functionToTest.overDependency.messages = [];
        //Test 1) Check for any assignments with global properties. Save these assignments for the next tests
        this.findAssignments(functionToTest.sequence);
        if(this.foundAssignments) {
            functionToTest.overDependency.messages.push({type: "warning", msg: warning("This function has "+this.assignments.length+" assignments with global variables.")});
            //this.score++;
            this.score += this.assignments.length;
        } else {
            functionToTest.overDependency.messages.push({type: "okay", msg: okay("No use of global variables within assignment operations.")});
        }

        //Test 2) Check if any global property exist within checks (this includes properties from assignments)
        this.findChecksWithGlobalStates(functionToTest.sequence);
        if(this.foundChecksWithGlobalVar) {
            functionToTest.overDependency.messages.push({type: "error", msg: error("This functions has "+this.checks.length+" checks that use global variables")});
            //this.score++;
            this.score += this.checks.length;
        } else {
            functionToTest.overDependency.messages.push({type: "okay", msg: okay("No checks use global variables.")});
        }

        //Test 3)
        this.findReturns(functionToTest.sequence);
        if(this.foundReturnVariable) {
            functionToTest.overDependency.messages.push({type: "warning", msg: warning("This function has "+this.returns.length+" return statement uses/returns a global variable that may be manipulated.")});
            //this.score++;
            this.score += this.returns.length;
        } else {
            functionToTest.overDependency.messages.push({type: "okay", msg: okay("Return value is clean from global variables.")});
        }

        functionToTest.overDependency.score = this.score;
        functionToTest.overDependency.scoreLimit = this.scoreLimit;
        functionToTest.overDependency.foundAssignments = this.foundAssignments;
        functionToTest.overDependency.foundChecksWithGlobalVar = this.foundChecksWithGlobalVar;
        functionToTest.overDependency.foundReturnVariable = this.foundReturnVariable;
    },

    //Main function to be called by proof-read.js to test
    test: function(functionAST) {
        let functionToTest = {};
        let functionASTClone = JSON.parse(JSON.stringify(functionAST)); //clone to prevent shallow copy
        for(let i=0;i<functionASTClone.length;i++){
            //Reset for the next function
            this.score = 0;
            this.scoreLimit = 3;
            this.assignmentIDs = [];
            this.assignments = [];
            this.checks = [];
            this.returns = [];
            //this.interactions = [];
            this.foundAssignments = false;
            this.foundChecksWithGlobalVar = false;
            this.foundReturnVariable = false;
            functionToTest = functionASTClone[i];
            //Test the next function for some over dependency
            this.determineAndScore(functionToTest);
            //assign the results to the given functionAST object from proof-read.js
            functionAST[i].overDependency = functionToTest.overDependency;
        }
    }
};