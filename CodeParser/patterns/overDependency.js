/*jshint esversion: 9*/
/* eslint-env es6 */
var dictionary = require("../dictionary.json");
const chalk = require('chalk');
const okay = chalk.green;
const error = chalk.red;
const warning = chalk.yellow;
/*
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
    scoreLimit = 3, relating to 3 boolean checks (foundAssignments, foundChecksLeadingToInteraction, foundReturnVariable).
    score = increases as more of those checks are true. Score increments whenever those checks are marked true in Test 1), Test 2) and Test 3) respectfully.
    3 boolean values, foundAssignments, foundChecksLeadingToInteraction, and foundReturnVariable.
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

    //Test 1) This checks for any assignments of the globalVars defined. This is used later in Test 1 and 2 to see if these variables based on the global vars are being used
    foundAssignments : false,
    findAssignments: function (sequence) {
        for(let i = 0; i < sequence.length; i++) {
            let assignemnt = {};
            //check an assignment or variable declaration is using some kind of global var
            if(sequence[i].initialValue) {
                //if the global var is used in some kind of operation (like a math one)
                if(Array.isArray(sequence[i].initialValue)) {
                    for(let y=0; y < sequence[i].initialValue.length; y++){
                        if(this.order.globalVar.includes(sequence[i].initialValue[y].left) || 
                        this.order.globalVar.includes(sequence[i].initialValue[y].right)) {
                            this.foundAssignments = true;
                            if(!this.assignmentIDs.includes(sequence[i].id)) {
                                assignemnt.name = sequence[i].name; assignemnt.id = sequence[i].id;
                                this.assignments.push(assignemnt);
                                this.assignmentIDs.push(sequence[i].id);
                            }
                        //else if this assignment is using another variable that was assigned the global var, save it too
                        } else if(this.assignmentIDs.includes(sequence[i].initialValue[y].leftVarID) ||
                        this.assignmentIDs.includes(sequence[i].initialValue[y].rightVarID)) {
                            if(!this.assignmentIDs.includes(assignemnt)) {
                                assignemnt.name = sequence[i].name; assignemnt.id = sequence[i].id;
                                this.assignments.push(assignemnt);
                                this.assignmentIDs.push(sequence[i].id);
                            }
                        }
                    }
                    //a normal simple single assignment
                } else {
                    if(this.order.globalVar.includes(sequence[i].initialValue)) { 
                        this.foundAssignments = true;
                        if(!this.assignmentIDs.includes(sequence[i].id)) {
                            assignemnt.name = sequence[i].name; assignemnt.id = sequence[i].id;
                            this.assignments.push(assignemnt);
                            this.assignmentIDs.push(sequence[i].id);
                        }
                    } else if(this.assignmentIDs.includes(sequence[i].referencedDeclaration)) {
                        if(!this.assignmentIDs.includes(sequence[i].id)) {
                            assignemnt.name = sequence[i].name; assignemnt.id = sequence[i].id;
                            this.assignments.push(assignemnt);
                            this.assignmentIDs.push(sequence[i].id);
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
                if(sequence[i].falseBody) {
                    let elseIf = [sequence[i].falseBody];
                    this.findAssignments(elseIf);
                }
            }
        }
    },

    //Test 2) is simply checking if block.timestamp (or now), block.number and tx.origin are directly used in any math operations effects or control structures such as ifs or loops.
    foundChecksLeadingToInteraction : false, 
    checks : [],
    findChecks: function (sequence) {
        for(let i = 0; i < sequence.length; i++) {
            //if this is a check, look into the conditions
            if(this.order.checks.includes(sequence[i].nodeType)) {
                for(let y=0; y < sequence[i].conditions.length; y++){
                    //direct checks
                    if(this.order.globalVar.includes(sequence[i].conditions[y].left) || 
                    this.order.globalVar.includes(sequence[i].conditions[y].right)) {
                        this.unpackChecks(sequence[i].trueBody);
                        break;
                    //assignment checks
                    } else if (this.assignmentIDs.includes(sequence[i].conditions[y].leftVarID) || 
                        this.assignmentIDs.includes(sequence[i].conditions[y].rightVarID)) {
                        this.unpackChecks(sequence[i].trueBody);
                        break;
                    }
                }
            }

            if(sequence[i].subBlock) {
                if(sequence[i].subBlock.length !== 0) {
                    this.findChecks(sequence[i].subBlock);
                }
            }
            //if any ifstatements (no checks for any kind of global var) are found via truebody, unpack
            if(sequence[i].trueBody){
                this.findChecks(sequence[i].trueBody);
                if(sequence[i].falseBody) {
                    let elseIf = [sequence[i].falseBody];
                    this.findChecks(elseIf);
                }
            }
        }
    },

    //Used for test 2)
    unpackChecks: function (sequence) {
        for(let i = 0; i < sequence.length; i++) {
            if(this.order.interactions.includes(sequence[i].nodeType)) {
                this.foundChecksLeadingToInteraction = true; 
            }
            //check if the interaction exist in an assignment statement
            if(sequence[i].initialValue) {
                if(this.order.interactions.includes(sequence[i].initialValue)) { 
                    this.foundChecksLeadingToInteraction = true; 
                }
            }

            //check if any interaction exists in a check statement (such as if or require)
            if(this.order.checks.includes(sequence[i].nodeType)) { 
                let conditions = sequence[i].conditions;
                for(let cond = 0; cond < conditions.length; cond++){
                    if((conditions[cond].condition && this.order.interactions.includes(conditions[cond].condition)) || 
                    (conditions[cond].left && this.order.interactions.includes(conditions[cond].left))) {
                        this.foundChecksLeadingToInteraction = true;
                    }
                }
            }

            if(sequence[i].subBlock) {
                if(sequence[i].subBlock.length !== 0) {
                    this.unpackChecks(sequence[i].subBlock);
                }
            }
            //if any ifstatements (no checks for any kind of global var) are found via truebody, unpack
            if(sequence[i].trueBody){
                this.unpackChecks(sequence[i].trueBody);
                if(sequence[i].falseBody) {
                    let elseIf = [sequence[i].falseBody];
                    this.unpackChecks(elseIf);
                }
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
                    if(this.order.globalVar.includes(sequence[i].conditions[y].condition) || 
                    this.order.globalVar.includes(sequence[i].conditions[y].left) || 
                    this.order.globalVar.includes(sequence[i].conditions[y].right)) {
                        this.foundReturnVariable = true;

                    } else if (this.assignmentIDs.includes(sequence[i].conditions[y].conditionVarID) || 
                    this.assignmentIDs.includes(sequence[i].conditions[y].leftVarID) || 
                    this.assignmentIDs.includes(sequence[i].conditions[y].rightVarID)) { 
                        this.foundReturnVariable = true;
                    //if the condition was a functionCall it would have arguments that need to be check (like typeConversions or Blockhash)
                    } else if (sequence[i].conditions[y].arguments) {
                        this.flag = false;
                        this.unpackFunctionArguments(sequence[i].conditions[y].arguments);
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
                if(sequence[i].falseBody) {
                    let elseIf = [sequence[i].falseBody];
                    this.findReturns(elseIf);
                }
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

    determineAndScore: function (functionToTest) {
        functionToTest.overDependency = {};
        functionToTest.overDependency.messages = [];
        //Test 1) Check for any assignments with global properties. Save these assignments for the next tests
        this.findAssignments(functionToTest.sequence);
        if(this.foundAssignments) {
            functionToTest.overDependency.messages.push({type: "warning", msg: warning("This function has some assignments with global variables.")});
            this.score++;
        } else {
            functionToTest.overDependency.messages.push({type: "okay", msg: okay("No use of global variables within assignment operations.")});
        }

        //Test 2) Check if any global property exist within checks (this includes properties from assignments)
        this.findChecks(functionToTest.sequence);
        if(this.foundChecksLeadingToInteraction) {
            functionToTest.overDependency.messages.push({type: "error", msg: error("This function has checks using global variables (block state or tx) before an interaction.")});
            this.score++;
        } else {
            functionToTest.overDependency.messages.push({type: "okay", msg: okay("Interactions are not determined by global variables.")});
        }

        //Test 3)
        this.findReturns(functionToTest.sequence);
        if(this.foundReturnVariable) {
            functionToTest.overDependency.messages.push({type: "warning", msg: warning("This function's return statement uses/returns a global variable that may be manipulated.")});
            this.score++;
        } else {
            functionToTest.overDependency.messages.push({type: "okay", msg: okay("Return value is clean from global variables.")});
        }

        functionToTest.overDependency.score = this.score;
        functionToTest.overDependency.scoreLimit = this.scoreLimit;
        functionToTest.overDependency.foundAssignments = this.foundAssignments;
        functionToTest.overDependency.foundChecksLeadingToInteraction = this.foundChecksLeadingToInteraction;
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
            this.foundAssignments = false;
            this.foundChecksLeadingToInteraction = false;
            this.foundReturnVariable = false;
            functionToTest = functionASTClone[i];
            //Test the next function for some over dependency
            this.determineAndScore(functionToTest);
            //assign the results to the given functionAST object from proof-read.js
            functionAST[i].overDependency = functionToTest.overDependency;
        }
    }
};