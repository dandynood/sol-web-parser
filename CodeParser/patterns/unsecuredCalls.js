/*jshint esversion: 9*/
/* eslint-env es6 */
var dictionary = require("../dictionary.json");
const chalk = require('chalk');
const okay = chalk.green;
const error = chalk.red;
/*
    Unsecured Calls are Solidity interactions such as call(), send() or similar which
    1) Are not secured with a locking mechanism (needs a boolean effect changed before the interaction and a check if locked)
    2) Have critical effects together with an interaction (espeically after)

    Because of the lack of context a code parser has to determine what are "critical effects" and what "lock" is being used, we assume the following tests
    Test 1) Find if any effects exist after the interaction 
    Test 2) Find if an interaction is contained within a check block (like if)
    Test 3) Check if there is a lock variable being checked and changed before an interaction (whether require or the check block the interaction is residing).

    Expected results:
    scoreLimit = 3, relating to 3 boolean checks (effectsAfter, noChecksBefore, effectsCheckedandChanged).
    score = increases as more of those checks are true. Score increments whenever those checks are marked true in Test 1), Test 2) and Test 3) respectfully 
    3 boolean values, effectsAfter, noChecksBefore, and effectsCheckedandChanged.
    messages = array of formatted console messages using chalk. Comes with a type for later formatting in the browser view
*/
module.exports = {

    //Score that increments base on issues found
    score:  0,
    scoreLimit: 3,
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
            dictionary.Opcode.CallCode
        ],
        checks: [
            dictionary.Opcode.Require,
            dictionary.Statements.IfStatement,
            dictionary.Statements.ElseIfStatement
        ]
    },
    
    //Test 1) If any effects exist after any interaction it can be considered problematic. All interactions should be last if possible
    foundFirstInteraction: false,
    effectsAfter: false,
    findEffectsAfterInteraction: function(sequence) {
        for(let i = 0; i < sequence.length; i++) {
            //if an interaction is found by itself
            if(this.order.interactions.includes(sequence[i].nodeType)) { this.foundFirstInteraction = true; }
            //or if the interaction exists within a check like if or require
            if(this.order.checks.includes(sequence[i].nodeType)){
                let conditions = sequence[i].conditions;
                for(let cond = 0; cond < conditions.length; cond++){
                    if((conditions[cond].condition && this.order.interactions.includes(conditions[cond].condition)) || 
                    (conditions[cond].left && this.order.interactions.includes(conditions[cond].left))) {
                        this.foundFirstInteraction = true;
                    }
                }
            }
            //check if the interaction exist in an assignment statement
            if(sequence[i].initialValue) {
                if(this.order.interactions.includes(sequence[i].initialValue)) { this.foundFirstInteraction = true; }
            }
            //if any effects is found after an interaction, it could be problematic due to reachability issues
            if(this.order.effects.includes(sequence[i].nodeType) && this.foundFirstInteraction) { this.effectsAfter = true; }

            if(sequence[i].subBlock) {
                if(sequence[i].subBlock.length !== 0) {
                    this.findEffectsAfterInteraction(sequence[i].subBlock);
                }
            }
            //if any ifstatements are found via truebody, unpack
            if(sequence[i].trueBody){
                this.findEffectsAfterInteraction(sequence[i].trueBody);
                if(sequence[i].falseBody) {
                    let elseIf = [sequence[i].falseBody];
                    this.findEffectsAfterInteraction(elseIf);
                }
            }
        }
    },

    //Test 2) Any check preceeds an interaction, which implies a locking mechanism. If not, it is problematic
    //If an if is being used, the interaction must exist in the if-block
    noChecksBefore : false,
    findChecksBeforeInteraction : function(sequence, foundCheck=false) {
        for(let i = 0; i < sequence.length; i++) {
            //check if any interaction exists in a check statement (such as if or require)
            if(this.order.checks.includes(sequence[i].nodeType)) { 
                let conditions = sequence[i].conditions;
                for(let cond = 0; cond < conditions.length; cond++){
                    if(((conditions[cond].condition && this.order.interactions.includes(conditions[cond].condition)) || 
                    (conditions[cond].left && this.order.interactions.includes(conditions[cond].left))) && !foundCheck) {
                        foundCheck = false; //if an interaction exists, this isn't really a check to lock
                        this.noChecksBefore = true; //and if no preceeding check was found, it's implying the interaction isn't within a lock
                    } else {
                        foundCheck = true; //else if no interaction, it could be a legitimate check
                    }
                }
            }
            //if an interaction is found before a check, it is problematic
            if(this.order.interactions.includes(sequence[i].nodeType) && !foundCheck) { this.noChecksBefore = true; }
            //check if the interaction exist in an assignment statement. If it's found before a check, it is problematic
            if(sequence[i].initialValue) {
                if(this.order.interactions.includes(sequence[i].initialValue) && !foundCheck) { this.noChecksBefore = true; }
            }

            if(sequence[i].subBlock) {
                if(sequence[i].subBlock.length !== 0) {
                    this.findChecksBeforeInteraction(sequence[i].subBlock, false);
                }
            }
            //if any ifstatements are found via truebody, unpack. It will be noted if this check is a potential lock or not
            if(sequence[i].trueBody){
                this.findChecksBeforeInteraction(sequence[i].trueBody, foundCheck);
                if(sequence[i].falseBody) {
                    let elseIf = [sequence[i].falseBody];
                    this.findChecksBeforeInteraction(elseIf);
                }
            }
        }
    },

    //Test 3) Check if the check's conditions have been updated later on before an interaction
    checks : [],
    foundInteraction : false,
    effectsCheckedandChanged : false,
    //for specific messages
    noUpdateFound : true, 
    updatedAfter: false,
    findCheckEffectChangesBeforeInteraction : function(sequence) {
        for(let i = 0; i < sequence.length; i++) {
            let statement = {};
            //include require() as it can lock out any statement/interaction after it
            //if we found a check, save it for later
            if(this.order.checks.includes(sequence[i].nodeType)) { 
                foundCheck = true;
                statement.nodeType = sequence[i].nodeType;
                statement.conditions = sequence[i].conditions;
                this.checks.push(statement);
            } 
            //if we found an effect before an interaction, see if the effect has been used in the check saved earlier
            //by right if an interaction is found first, then an effect, it is problematic (false)
            //If an effect is before an interaction and yet it does not appear in previous checks, then it is also problematic (false)
            if(this.order.effects.includes(sequence[i].nodeType)) {
                for(let y=0; y<this.checks.length;y++){
                    let check = this.checks[y];
                    for(let x=0;x<check.conditions.length;x++){
                        if((check.conditions[x].leftVarID || check.conditions[x].conditionVarID) && 
                        (sequence[i].id === check.conditions[x].leftVarID || sequence[i].id === check.conditions[x].conditionVarID)) {
                            this.noUpdateFound = false;
                            if(!this.foundInteraction) {
                                this.effectsCheckedandChanged = true;
                            } else if (this.foundInteraction) {
                                this.updatedAfter = true;
                                this.effectsCheckedandChanged = false;
                            }
                        }
                    }
                }
            }
            //if we found an interaction, mark a flag
            if(this.order.interactions.includes(sequence[i].nodeType)) { this.foundInteraction = true; }
            //check if the interaction exist in an assignment statement
            if(sequence[i].initialValue) {
                if(this.order.interactions.includes(sequence[i].initialValue)) { this.foundInteraction = true; }
            }

            if(sequence[i].subBlock) {
                if(sequence[i].subBlock.length !== 0) {
                    this.findCheckEffectChangesBeforeInteraction(sequence[i].subBlock);
                }
            }
            //if any ifstatements are found via truebody, unpack. Also note as it is a found check
            if(sequence[i].trueBody){
                this.findCheckEffectChangesBeforeInteraction(sequence[i].trueBody);
                if(sequence[i].falseBody) {
                    let elseIf = [sequence[i].falseBody];
                    this.findCheckEffectChangesBeforeInteraction(elseIf);
                }
            }
        }
    },

    /*4 Determine the ordering of each code block's stack. Increment the score by 1 when one violation is found per "interactions-effects" sequence*/
    determineOrderAndScore: function (functionToTest) {
        //console.log("Function: ", functionToTest);
        functionToTest.unsecuredCalls = {};
        functionToTest.unsecuredCalls.messages = [];

        //Test 1) check if effects are after interaction
        this.findEffectsAfterInteraction(functionToTest.sequence);
        if(this.foundFirstInteraction) {
            if(this.effectsAfter) {
                this.score++;
                functionToTest.unsecuredCalls.messages.push({type: "error", msg: error("This function has effects (assignments or declarations) after an interaction.")});
            } else {
                functionToTest.unsecuredCalls.messages.push({type: "okay", msg: okay("No effects found after interactions.")});
            }

            //Test 2) check if no checks are found before interaction
            this.findChecksBeforeInteraction(functionToTest.sequence);
            if(this.noChecksBefore) {
                this.score = this.score + 2; //+ 2 since Test 3 will gurantee to fail as well. A interaction needs to be within a check block to qualify
                functionToTest.unsecuredCalls.messages.push({type: "error", msg: error("This function has no checks before an interaction to act as a lock.")});
                functionToTest.unsecuredCalls.messages.push({type: "error", msg: error("With an interaction outside of the check, any locking updates are moot.")});
            } else {
                functionToTest.unsecuredCalls.messages.push({type: "okay", msg: okay("Checks found before interaction.")});
                //Test 3) check if the variable/effect used in the check hasn't been changed prior interaction
                this.findCheckEffectChangesBeforeInteraction(functionToTest.sequence);
                //by right if an effect-interaction sequence is found, the effect should be checked and changed prior. If not it is problematic
                if(!this.effectsCheckedandChanged && this.foundInteraction) {
                    this.score++;
                    if (this.updatedAfter) {
                        functionToTest.unsecuredCalls.messages.push({type: "error", msg: error("This function's lock conditions are only updated after an interaction, which is vulnerable to unreachability.")});
                    } else if (this.noUpdateFound) {
                        functionToTest.unsecuredCalls.messages.push({type: "error", msg: error("This function's lock conditions for an interaction are never updated.")});
                    }
                } else {
                    functionToTest.unsecuredCalls.messages.push({type: "okay", msg: okay("Check's condition is updated before interaction.")});
                }
            }
        } else {
            functionToTest.unsecuredCalls.messages.push({type: "okay", msg: okay("No interactions found in this function.")});
            this.scoreLimit = 0;
        }
        
        functionToTest.unsecuredCalls.effectsAfter = this.effectsAfter;
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
            this.scoreLimit = 3;
            functionToTest = functionASTClone[i];
            this.effectsAfter = false; 
            this.foundFirstInteraction = false;
            this.noChecksBefore = false;
            this.checks = [];
            this.foundInteraction = false;
            this.effectsCheckedandChanged = false;
            this.noUpdateFound = true;
            this.updatedAfter = false;
            //Test the next function for unsecured calls
            this.determineOrderAndScore(functionToTest);
            //assign the results to the given functionAST object from proof-read.js
            functionAST[i].unsecuredCalls = functionToTest.unsecuredCalls;
        }
    }
};