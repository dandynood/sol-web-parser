/*jshint esversion: 9*/
/* eslint-env es6 */
const fs = require('fs');
//for CLI formatting
const chalk = require('chalk');
const error = chalk.bold.red;
const warning = chalk.keyword('orange');
let dictionary = require("./dictionary.json");
const contractDir = './build/contracts/';

module.exports = {

    /*1a. Parses the truffle JSON file to extract the functions AST for use*/
    //if the function is not found, it will return false as an error flag
    parseAST: function(contractName, functionName) {
        /*1.Extract all nodes/functions from the the AST in the built JSON*/
        let rawBuild = fs.readFileSync(contractDir + contractName + '.json');
        let buildJSON = JSON.parse(rawBuild);
        let nodes = buildJSON.ast.nodes;
        //make sure we get nodes starting from ContractDefinition (to prevent outside pragma directives and others)
        for(let i=0;i<nodes.length;i++) {
            if(nodes[i].nodeType === "ContractDefinition" && nodes[i].name === contractName) {
                nodes = nodes[i].nodes;
                break;
            }
        }

        /*Get all functions statements*/
        let functions = [];
        let individualFunction = {};
        for (let i = 0; i < nodes.length; i++) {
            if ('body' in nodes[i] && nodes[i].nodeType == dictionary.Statements.FunctionDefinition) {
                individualFunction = {};
                //check the "kind" of function whether it's a constructor or fallback. They have empty names, so hence they should be named "constructor" or "fallback" accordingly
                individualFunction.name = (nodes[i].kind === "constructor" ? "constructor" : nodes[i].kind === "fallback" ? "fallback" :nodes[i].name); //else, just get the name
                individualFunction.visibility = nodes[i].visibility;
                individualFunction.stateMutability = nodes[i].stateMutability;
                individualFunction.statements = nodes[i].body.statements;
                //get the names of modifiers if it exists
                individualFunction.modifiers = [];
                for(let y=0; y < nodes[i].modifiers.length; y++){
                    let functionModifier = {};
                    functionModifier.name =  nodes[i].modifiers[y].modifierName.name;
                    //Get any bodies of modifiers if it exists
                    for (let z = 0; z < nodes.length; z++) {
                        if ('body' in nodes[z] && nodes[z].nodeType == dictionary.Statements.ModifierDefinition && nodes[z].name === functionModifier.name) {
                            functionModifier.statements = nodes[z].body.statements;
                        }
                    }
                    individualFunction.modifiers.push(functionModifier);
                } 
                functions.push(individualFunction);
            }
        }
        
        /*Filter out for a specific function if functionName argument is filled*/
        if(functionName !== ""){
            let found = false;
            let specificFunction = [];
            for (let i = 0; i < functions.length; i++)  {
                if (functions[i].name === functionName) {
                    found = true;
                    specificFunction.push(functions[i]);
                    break;
                }
            }
            return (found ? specificFunction : false); //If function is found return, if not a false flag is given
        }

        return functions;
    },

    /*1b. Get any fields of the contract*/
    parseContractFields : function (contractName) {
        /*Get all fields*/
        /*1.Extract all nodes/functions from the the AST in the built JSON*/
        let rawBuild = fs.readFileSync(contractDir + contractName + '.json');
        let buildJSON = JSON.parse(rawBuild);
        let nodes = buildJSON.ast.nodes;
        //make sure we get nodes starting from ContractDefinition (to prevent outside pragma directives and others)
        for(let i=0;i<nodes.length;i++) {
            if(nodes[i].nodeType === "ContractDefinition" && nodes[i].name === contractName) {
                nodes = nodes[i].nodes;
                break;
            }
        }

        let fields = [];
        let individualField = {};
        for (let i = 0; i < nodes.length; i++) {
            if (nodes[i].nodeType === dictionary.Statements.VariableDeclaration && nodes[i].stateVariable) {
                individualField = {};
                if(nodes[i].value !== null) {
                    individualField.value = [];
                    this.extractConditions(nodes[i].value, individualField.value);
                } 
                individualField.name = nodes[i].name;
                individualField.id = nodes[i].id;
                individualField.type = nodes[i].typeDescriptions.typeString;
                if(individualField.value && individualField.value.length === 1 && individualField.value[0].condition) {
                    if(individualField.value[0].conditionVarID) { individualField.referencedDeclaration = individualField.value[0].conditionVarID;}
                    individualField.value = individualField.value[0].condition;
                }
                fields.push(individualField);
            }
        }
        return fields;
    },
    
    /*This simply converts "ExpressionStatements" into more strongly defined types*/
    //Examples include ExpressionStatemen => Assignment or FunctionCall
    parseAnyExpressions: function(statement, result) {
        if(statement.nodeType === dictionary.Statements.Return) {
            result.nodeType = statement.nodeType;
        } else if(statement.expression) {
            result.nodeType = statement.expression.nodeType;
        } else {
            result.nodeType = statement.nodeType;
        }
    },

    /*This extracts for any opcode present in a FunctionCall, Assignment or VariableDeclaration statement by using a dictionary of function signatures or "type identifiers"*/
    parseAnyForOpcode: function(statement, result = {}){
        if(statement.expression && statement.expression.typeDescriptions) {
            let type = "";
            let signature = statement.expression.typeDescriptions.typeIdentifier; //get signature
            let typeValues = Object.values(dictionary.TypeIdentifier); //get all values from this dictionary.TypeIdentifier

            //Cross reference signature if exists in the dictionary entry
            for(let i = 0; i  < typeValues.length; i++){
                if(signature.includes(typeValues[i])) {
                    //if the signature corresponds to a specific opcode, return that specific opcode instead (e.g. return Call or Send instead of just plain FunctionCall in the expression)
                    type = Object.keys(dictionary.TypeIdentifier)[Object.values(dictionary.TypeIdentifier).indexOf(typeValues[i])];
                    result.nodeType = type;
                    return type;
                }
            }
            //If no opcode is found and it is just a normal function
            if(type.length === 0) {
                //return the node type (FunctionCall) if the kind is a functionCall
                if(statement.kind === "functionCall") {
                    result.nodeType = statement.nodeType;
                    if(statement.expression.memberName) { 
                        result.name = statement.expression.memberName; 
                    } else if (statement.expression.name) { result.name = statement.expression.name; }
                    return statement.nodeType;
                } else {
                    //if not, it might be a special kind such as typeConversions like uint(...)
                    result.nodeType = statement.kind;
                    return statement.kind;
                }
            }
        //else if no entry, return the nodeType of the expression 
        } else {
            return statement.nodeType;
        }
    },

    /*Determines if a member access is using a Solidity global variable based on its type identifier, e.g. block.number is using the root identifier "block" whose signature is "t_magic_block"*/
    globalVarName : "",
    foundVar: false,
    parseAnyForGlobalVar: function(statementExpression) {
        //first find the root which is the Identifier. If this expression is not, uncover the next
        if(statementExpression.nodeType !== dictionary.Statements.Identifier && statementExpression.expression) {
            this.parseAnyForGlobalVar(statementExpression.expression);
        //else if it is the root, determine the global var via its signature
        } else if (statementExpression.nodeType === dictionary.Statements.Identifier && statementExpression.name !== dictionary.GlobalVar.Now) {
            let signature = statementExpression.typeDescriptions.typeIdentifier; //get signature
            let typeValues = Object.values(dictionary.TypeIdentifier); //get all values from this dictionary.TypeIdentifier

            //Cross reference signature if exists in the dictionary entry
            for(let i = 0; i  < typeValues.length; i++){
                if(signature.includes(typeValues[i])) {
                    //if the signature corresponds to a specific opcode, return that specific opcode instead (e.g. return Call or Send instead of just plain FunctionCall in the expression)
                    let type = Object.keys(dictionary.TypeIdentifier)[Object.values(dictionary.TypeIdentifier).indexOf(typeValues[i])];
                    this.globalVarName += type + ".";
                    break;
                }
            }
        } else if (statementExpression.nodeType === dictionary.Statements.Identifier && statementExpression.name === dictionary.GlobalVar.Now) {
            this.globalVarName = statementExpression.name;
        }

        if(statementExpression.nodeType === dictionary.Statements.MemberAccess) {
            this.globalVarName += statementExpression.memberName + ".";
        }
    },

    //This extracts all the conditions neatly for each if/else if statement. It is rather long as it considers tuples and subexpressions for both left and right conditions
    extractConditions : function(ifCondition, conditions = []){
        let condition = {};
        //if it's a pure value like "true" or "false"
        if(ifCondition.value){
            condition.condition = ifCondition.value;
            conditions.push(condition);
        } else if(ifCondition.name && ifCondition.referencedDeclaration) {
            condition.condition = ifCondition.name;
            condition.conditionVarID = ifCondition.referencedDeclaration;
            conditions.push(condition);
        //else if it is a subexpression like unary operation on one variable...
        } else if (ifCondition.subExpression) {
            condition.unary = ifCondition.operator;
            if(ifCondition.subExpression.referencedDeclaration && ifCondition.subExpression.name) {
                    condition.condition = ifCondition.subExpression.name;
                    condition.conditionVarID = ifCondition.subExpression.referencedDeclaration;
            } else if (ifCondition.subExpression.value) { 
                condition.condition = ifCondition.subExpression.value; 
            } else if (ifCondition.subExpression.expression && ifCondition.subExpression.nodeType === dictionary.Statements.FunctionCall) {
                condition.condition = this.parseAnyForOpcode(ifCondition.subExpression);
                condition.arguments = [];
                if(ifCondition.subExpression.arguments) {
                    for(let arg=0; arg < ifCondition.subExpression.arguments.length; arg++) {
                        this.extractConditions(ifCondition.subExpression.arguments[arg], condition.arguments);
                    }
                }
            }
            conditions.push(condition);
        //if it's a single function call, determine if it's an opcode e.g. Send
        } else if (ifCondition.expression && ifCondition.nodeType === dictionary.Statements.FunctionCall) {
            condition.condition = this.parseAnyForOpcode(ifCondition);
            condition.arguments = [];
            if(ifCondition.arguments) {
                for(let arg=0; arg < ifCondition.arguments.length; arg++) {
                    this.extractConditions(ifCondition.arguments[arg], condition.arguments);
                }
            }
            conditions.push(condition);
        } else if (ifCondition.nodeType === dictionary.Statements.MemberAccess) {
            this.globalVarName = "";
            this.parseAnyForGlobalVar(ifCondition);
            condition.condition = this.globalVarName.substring(0, this.globalVarName.length - 1);
            conditions.push(condition);
        }

        if(ifCondition.leftExpression && ifCondition.rightExpression) {
            //Traverse Left
            //A subexpression within the left expression can be a unary operation like a prefix + name
            if(ifCondition.leftExpression.subExpression){
                condition.leftUnary = ifCondition.leftExpression.operator;
                if(ifCondition.leftExpression.subExpression.referencedDeclaration && ifCondition.leftExpression.subExpression.name) {
                    condition.left = ifCondition.leftExpression.name;
                    condition.leftVarID = ifCondition.leftExpression.referencedDeclaration;
                } else if (ifCondition.leftExpression.subExpression.value) { 
                    condition.left = ifCondition.leftExpression.subExpression.value; 
                } else if (ifCondition.leftExpression.subExpression.nodeType === dictionary.Statements.FunctionCall) {
                    condition.left = this.parseAnyForOpcode(ifCondition.leftExpression.subExpression);
                    condition.leftArguments = [];
                    if(ifCondition.leftExpression.subExpression.arguments) {
                        for(let arg=0; arg < ifCondition.leftExpression.subExpression.arguments.length; arg++) {
                            this.extractConditions(ifCondition.leftExpression.subExpression.arguments[arg], condition.leftArguments);
                        }
                    }
                } else if (ifCondition.leftExpression.subExpression.nodeType === dictionary.Statements.MemberAccess) {
                    this.globalVarName = "";
                    this.parseAnyForGlobalVar(ifCondition.leftExpression.subExpression);
                    condition.left = this.globalVarName.substring(0, this.globalVarName.length - 1);
                }
            }            
            //Get Left whether it be a variable name or a value, or a functionCall and its arguments
            if(ifCondition.leftExpression.referencedDeclaration && ifCondition.leftExpression.name) {
                condition.left = ifCondition.leftExpression.name;
                condition.leftVarID = ifCondition.leftExpression.referencedDeclaration;
            } else if (ifCondition.leftExpression.value) { 
                condition.left = ifCondition.leftExpression.value; 
            } else if (ifCondition.leftExpression.nodeType === dictionary.Statements.FunctionCall) {
                condition.left = this.parseAnyForOpcode(ifCondition.leftExpression);
                condition.leftArguments = [];
                if(ifCondition.leftExpression.arguments) {
                    for(let arg=0; arg < ifCondition.leftExpression.arguments.length; arg++) {
                        this.extractConditions(ifCondition.leftExpression.arguments[arg], condition.leftArguments);
                    }
                }
            } else if (ifCondition.leftExpression.nodeType === dictionary.Statements.MemberAccess) {
                this.globalVarName = "";
                this.parseAnyForGlobalVar(ifCondition.leftExpression);
                condition.left = this.globalVarName.substring(0, this.globalVarName.length - 1);
            }
            
            //A subexpression within the right expression can be a unary operation like a prefix + name
            if(ifCondition.rightExpression.subExpression){
                condition.rightUnary = ifCondition.rightExpression.operator;
                if(ifCondition.rightExpression.subExpression.referencedDeclaration && ifCondition.rightExpression.subExpression.name) {
                    condition.right = ifCondition.rightExpression.name;
                    condition.rightVarID = ifCondition.rightExpression.referencedDeclaration;
                } else if (ifCondition.rightExpression.subExpression.value) { 
                    condition.right = ifCondition.rightExpression.subExpression.value; 
                } else if (ifCondition.rightExpression.subExpression.nodeType === dictionary.Statements.FunctionCall) {
                    condition.right = this.parseAnyForOpcode(ifCondition.rightExpression.subExpression);
                    condition.rightArguments = [];
                    if(ifCondition.rightExpression.subExpression.arguments) {
                        for(let arg=0; arg < ifCondition.rightExpression.subExpression.arguments.length; arg++) {
                            this.extractConditions(ifCondition.rightExpression.subExpression.arguments[arg], condition.rightArguments);
                        }
                    }
                } else if (ifCondition.rightExpression.subExpression.nodeType === dictionary.Statements.MemberAccess) {
                    this.globalVarName = "";
                    this.parseAnyForGlobalVar(ifCondition.rightExpression.subExpression);
                    condition.right = this.globalVarName.substring(0, this.globalVarName.length - 1);
                }
            } 
            //Get Right whether it be a variable name or value or a functionCall
            if(ifCondition.rightExpression.referencedDeclaration && ifCondition.rightExpression.name) {
                condition.right = ifCondition.rightExpression.name;
                condition.rightVarID = ifCondition.rightExpression.referencedDeclaration; 
            } else if (ifCondition.rightExpression.value) { 
                condition.right = ifCondition.rightExpression.value; 
            } else if (ifCondition.rightExpression.nodeType === dictionary.Statements.FunctionCall) {
                condition.right = this.parseAnyForOpcode(ifCondition.rightExpression);
                condition.rightArguments = [];
                if(ifCondition.rightExpression.arguments) {
                    for(let arg=0; arg < ifCondition.rightExpression.arguments.length; arg++) {
                        this.extractConditions(ifCondition.rightExpression.arguments[arg], condition.rightArguments);
                    }
                }
            } else if (ifCondition.rightExpression.nodeType === dictionary.Statements.MemberAccess) {
                this.globalVarName = "";
                this.parseAnyForGlobalVar(ifCondition.rightExpression);
                condition.right = this.globalVarName.substring(0, this.globalVarName.length - 1);
            }
            //Traverse Left
            if(ifCondition.leftExpression.leftExpression){
                this.extractConditions(ifCondition.leftExpression, conditions);
                //if the condition is within a tuple, extract all conditions in the tuples neatly
            } else if (ifCondition.leftExpression.components){
                for(let i=0;i<ifCondition.leftExpression.components.length;i++) {
                    this.extractConditions(ifCondition.leftExpression.components[i], conditions);
                }
            }
            condition.operator = ifCondition.operator; //get operator
            conditions.push(condition);
            //Traverse right
            if(ifCondition.rightExpression.leftExpression){
                this.extractConditions(ifCondition.rightExpression, conditions);
                //if the condition is within a tuple, extract all conditions in the tuples neatly
            } else if (ifCondition.rightExpression.components){
                for(let i=0;i<ifCondition.rightExpression.components.length;i++) {
                    this.extractConditions(ifCondition.rightExpression.components[i], conditions);
                }
            }                        
        }
    },

    //if any else ifs or elses exists in the if statements, they are deeper levels of the AST of the IfStatement root
    extractElseIfStatements: function(elseIfStatements){
        let statement = {};
        //If an else if, it will have a truebody and falsebody
        if (elseIfStatements.trueBody) {
            if(elseIfStatements.trueBody.statements) {
                statement.trueBody = this.extractSequence(elseIfStatements.trueBody.statements);
            } else {
                statement.trueBody = this.extractSequence([elseIfStatements.trueBody]);
            }
            statement.nodeType = "ElseIfStatement";
            statement.conditions = [];
            this.extractConditions(elseIfStatements.condition, statement.conditions);
            if(elseIfStatements.falseBody)
                statement.falseBody = this.extractElseIfStatements(elseIfStatements.falseBody);
        }                  
        //if no other truebody exist within the falsebody and only statements exist, it is an else statement
        if (!elseIfStatements.truebody){
            statement.nodeType = "ElseStatement";
            if(elseIfStatements.statements) {
                statement.trueBody = this.extractSequence(elseIfStatements.statements);
            } else {
                statement.trueBody = this.extractSequence([elseIfStatements]);
            }
        }

        return statement;
    },

    /*2. Extracts all the nodeTypes and any sub-blocks (via recursion) of the function*/
    extractSequence: function (functionStatements) { 
        /*3. Correctly extract the sequence in readable form by nodeType*/
        //Make sure to extract from all trueBodys if they exists
        let sequence = [];

        for (let i = 0; i < functionStatements.length; i++) {
            let statement = {};
            if (functionStatements[i].nodeType) {
                this.parseAnyExpressions(functionStatements[i], statement); //get the specific type of statement from any Expression type statement

                //If a function call, determine if it is an opcode by using the function expression
                if(statement.nodeType === dictionary.Statements.FunctionCall) {
                    this.parseAnyForOpcode(functionStatements[i].expression, statement);
                    statement.arguments = [];
                    if(functionStatements[i].expression.arguments) {
                        for(let arg=0; arg < functionStatements[i].expression.arguments.length; arg++) {
                            this.extractConditions(functionStatements[i].expression.arguments[arg], statement.arguments);
                        }
                    }
                }
                
                //if it's found that the Call statement was a call.value()() variant, we get the call's actual argument instead.
                if(statement.nodeType  === dictionary.Opcode.Call && functionStatements[i].expression.expression.expression.memberName === "value") {
                    statement.arguments = [];
                    if(functionStatements[i].expression.expression.arguments) {
                        for(let arg=0; arg < functionStatements[i].expression.expression.arguments.length; arg++) {
                            this.extractConditions(functionStatements[i].expression.expression.arguments[arg], statement.arguments);
                        }
                    }
                }

                //For the case of Require since it is a common check control mechanism, extract its arguments
                if(statement.nodeType  === dictionary.Opcode.Require){
                    statement.conditions = [];
                    this.extractConditions(functionStatements[i].expression.arguments[0], statement.conditions);
                }
                //For return statements, get their conditions or return values
                if(statement.nodeType  === dictionary.Statements.Return){
                    statement.conditions = [];
                    this.extractConditions(functionStatements[i].expression, statement.conditions);
                }

                //If the statement is an assignment or variable declaration, get the name and data type of the left hand side
                if(statement.nodeType === dictionary.Statements.Assignment) {
                    statement.initialValue = []; //to be modified by extractConditions (will have condition information such as left, right, arguments, or operators)
                    this.extractConditions(functionStatements[i].expression.rightHandSide, statement.initialValue);
                    statement.name = functionStatements[i].expression.leftHandSide.name;
                    statement.id = functionStatements[i].expression.leftHandSide.referencedDeclaration;
                    statement.type = functionStatements[i].expression.typeDescriptions.typeString;
                    //if the initialValue modified by extractConditions is has only one condition, set that condition to the statement's initialValue property
                    if(statement.initialValue && statement.initialValue.length === 1 && statement.initialValue[0].condition) {
                        //if the initialValue has a referenced variable ID, set that property for more info
                        if(statement.initialValue[0].conditionVarID) { 
                            statement.referencedDeclaration = statement.initialValue[0].conditionVarID;
                        }
                        statement.arguments = statement.initialValue[0].arguments; //initialValue's arugments if any (such as if it's a function)
                        statement.initialValue = statement.initialValue[0].condition; //initialValue's node type (right hand side node type)
                    } 
                } 
                if(statement.nodeType === dictionary.Statements.VariableDeclarationStatement) {
                    if(functionStatements[i].initialValue) {
                        statement.initialValue = []; //to be modified by extractConditions (will have condition information such as left, right, arguments, or operators)
                        this.extractConditions(functionStatements[i].initialValue, statement.initialValue);
                    } 
                    statement.name = functionStatements[i].declarations[0].name;
                    statement.id = functionStatements[i].declarations[0].id;
                    statement.type = functionStatements[i].declarations[0].typeDescriptions.typeString;
                    //if the initialValue modified by extractConditions is has only one condition, set that condition to the statement's initialValue property
                    if(statement.initialValue && statement.initialValue.length === 1 && statement.initialValue[0].condition) {
                        if(statement.initialValue[0].conditionVarID) { 
                            statement.referencedDeclaration = statement.initialValue[0].conditionVarID;
                        }
                        statement.arguments = statement.initialValue[0].arguments; //initialValue's arugments if any (such as if it's a function)
                        statement.initialValue = statement.initialValue[0].condition; //initialValue's node type (right hand side node type)
                    }
                }
                if(statement.nodeType === dictionary.Statements.MemberAccess){
                    this.globalVarName = "";
                    this.parseAnyForGlobalVar(functionStatements[i].expression);
                    statement.nodeType = this.globalVarName.substring(0, this.globalVarName.length - 1);
                }
                if (statement.nodeType === dictionary.Statements.Identifier && functionStatements[i].expression.name === dictionary.GlobalVar.Now) {
                    statement.nodeType = functionStatements[i].expression.name;
                }

                //If an exists if-statement or similar, extract all statements in its subblocks via recursion
                if(functionStatements[i].trueBody){
                    //if the true body is not an array (as with the case of single statements with no block wrapping in the source code)
                    //else assigned the statements array from the truebodies
                    if(functionStatements[i].trueBody.statements) {
                        subStatements = functionStatements[i].trueBody.statements;
                    } else {
                        subStatements = [functionStatements[i].trueBody];
                    }
                    statement.trueBody = this.extractSequence(subStatements);
                    statement.conditions = [];
                    this.extractConditions(functionStatements[i].condition, statement.conditions);
                    if(functionStatements[i].falseBody) {
                        statement.falseBody = this.extractElseIfStatements(functionStatements[i].falseBody);
                    }
                }
                //if an ifstatement is found, send that over
                //extract truebody first
                //if falsebody found, check for truebody and extract from statementsBinaryOperation
                //if falsebody found with no truebody, it has statements.

                //If there exist any body in the statement (such as from loops like for, while or do while), extract the statements in the sub block
                if(functionStatements[i].body) {
                    //The result would be an object such as { nodeType:"IfStatement", statements: [...]}
                    subStatements = functionStatements[i].body.statements;
                    statement.subBlock = this.extractSequence(subStatements); //recursion call
                    //also get info on the trueBody's conditions
                    //statement.condition = this.extractConditions(functionStatements[i].condition);
                } 
                
                sequence.push(statement); //push at the end

            }
        }
        
        return sequence;
    },

    /*Prints out all sequences neatly from the array of objects*/
    //uses recursion for sub-blocks
    printSequence: function(sequence, tabsNeeded=0) {
        let tabString = "";
        for(let tabs=0;tabs<tabsNeeded;tabs++) tabString = tabString + "\t";
        for(let i = 0; i < sequence.length; i++) {
            //if an initial value exists, print "nodeType = initialValue". This is important for Assignments or VariableDeclarations
            if(sequence[i].initialValue) {
                //if the value is a binary operation expression, it be an array. Print as <left> <operator> <right>
                if(Array.isArray(sequence[i].initialValue)) {
                    let string = "";
                    for(let y=0; y < sequence[i].initialValue.length; y++){
                        if(sequence[i].initialValue[y].condition) {string += sequence[i].initialValue[y].condition; }
                        if(sequence[i].initialValue[y].left) {string += sequence[i].initialValue[y].left; }
                        if(sequence[i].initialValue[y].operator) {string += " " + sequence[i].initialValue[y].operator + " "; }
                        if(sequence[i].initialValue[y].right) {string += sequence[i].initialValue[y].right; }
                    }
                    console.log(tabString + sequence[i].nodeType + " = " + string);
                } else { console.log(tabString + sequence[i].nodeType + " = " + sequence[i].initialValue); }
            } else {
                console.log(tabString + sequence[i].nodeType);
            }

            //add a tab if a sub block is found for formatting
            if(sequence[i].subBlock) {
                if(sequence[i].subBlock.length !== 0) {
                    tabsNeeded++;
                    this.printSequence(sequence[i].subBlock, tabsNeeded);
                } else {
                    console.log("\t", "Empty");
                }
            }
            //if any ifstatements are found via truebody, unpack
            if(sequence[i].trueBody){
                tabsNeeded++; //move the sub statements forward
                this.printSequence(sequence[i].trueBody, tabsNeeded);
                if(sequence[i].falseBody) {
                    tabsNeeded--; //move back to display "ElseStatements" correctly. The sub statements will move forward again as we'll traverse its truebody
                    let elseIf = [sequence[i].falseBody];
                    this.printSequence(elseIf,tabsNeeded);
                }
            }
        }
    },

    printFields : function (fields) {
        for(let i = 0; i < fields.length; i++) {
            //if an initial value exists, print "nodeType = initialValue". This is important for Assignments or VariableDeclarations
            if(fields[i].value) {
                //if the value is a binary operation expression, it be an array. Print as <left> <operator> <right>
                if(Array.isArray(fields[i].value)) {
                    let string = "";
                    for(let y=0; y < fields[i].value.length; y++){
                        if(fields[i].value[y].condition) {string += fields[i].value[y].condition; }
                        if(fields[i].value[y].left) {string += fields[i].value[y].left; }
                        if(fields[i].value[y].operator) {string += " " + fields[i].value[y].operator + " "; }
                        if(fields[i].value[y].right) {string += fields[i].value[y].right; }
                    }
                    console.log(fields[i].type, fields[i].name + " = " + string);
                } else { console.log(fields[i].type, fields[i].name + " = " + fields[i].value); }
            } else {
                console.log(fields[i].type, fields[i].name);
            }
        }
    },

    //2nd handler of addModifierSequences
    modifiedSequence: [],
    spliceModifierSequences: function (finalSequence, otherSequence, name) {
        for(let i=0;i<finalSequence.length;i++){
            if(finalSequence[i].nodeType === "PlaceholderStatement") {
                let copy = JSON.parse(JSON.stringify(finalSequence)); //copy before manipulation
                //manipulate and save to the result (modifiedSequence)
                finalSequence.splice(i, 1, ...otherSequence);
                this.modifiedSequence = JSON.parse(JSON.stringify(finalSequence));
                //recopy the original traversing sequence
                finalSequence = JSON.parse(JSON.stringify(copy));
            }

            if(finalSequence[i].subBlock) {
                if(finalSequence[i].subBlock.length !== 0) {
                    this.spliceModifierSequences(finalSequence[i].subBlock, otherSequence, name);
                }
            }
            //if any ifstatements are found via truebody, unpack. Also note as it is a found check
            if(finalSequence[i].trueBody){
                this.spliceModifierSequences(finalSequence[i].trueBody, otherSequence, name);
                if(finalSequence[i].falseBody) {
                    let elseIf = [finalSequence[i].falseBody];
                    this.spliceModifierSequences(elseIf, otherSequence, name);
                }
            }
        }
    },

    /*Used in the case that a function has custom modifiers*/
    /*These modifiers need to be added to the function sequence before test. Find the placeholder statement and fill in the function sequence in its place*/
    addModifierSequences: function (modifiers, mainSequence) {
        let finalSequence = []; //sequence to traverse
        this.modifiedSequence = []; //a copy that acts as the final result
        //given this assumes already a modifier exists, add the first modifier to the final sequence
        finalSequence.push(...modifiers[0].sequence);
        this.modifiedSequence.push(...modifiers[0].sequence);
        //prepare to splice the n+1 or main function sequence by searching for the placeholder statement
        for(let i=0; i < modifiers.length; i++){
            //add modifiers in order, which goes from [0] to [n]
            //if another modifier exist, splice those in order
            if(modifiers[i+1]) {
                this.spliceModifierSequences(finalSequence, modifiers[i+1].sequence, modifiers[i+1].name);
            } else {
                //else the last splice should be the main function sequence
                this.spliceModifierSequences(finalSequence, mainSequence, "final");
            }
        }
        return finalSequence;
    },

    /*Function used by proof-read.js main(), handles step by step process*/
    extraction: function (contractName, functionName) {
        console.log(chalk.underline.blue("Extraction intiated"));
        console.log(chalk.yellow("Contract: ") + contractName);
        if(functionName !== "") {
            console.log(chalk.yellow("Extracting from " ) + functionName);
        } else {
            console.log(chalk.yellow("Extracting All functions"));
        }

        /*1.Call parseAST to extract and find the function*/
        functionsToExtract = this.parseAST(contractName, functionName);
        let results = [];
        //If functions exists..
        if(functionsToExtract) {
            /*2. Extract the code sequence from each function*/
            let functionResult;
            for(let i=0;i<functionsToExtract.length;i++) {
                functionResult = {};
                functionResult.name = functionsToExtract[i].name;
                functionResult.visibility = functionsToExtract[i].visibility;
                functionResult.stateMutability = functionsToExtract[i].stateMutability;
                functionResult.modifiers = [];
                //if any modifiers exist for this function, extract its sequence
                if(functionsToExtract[i].modifiers.length > 0) {
                    for(let y=0;y<functionsToExtract[i].modifiers.length;y++){
                        let modifier = {};
                        modifier.name = functionsToExtract[i].modifiers[y].name;
                        modifier.sequence = this.extractSequence(functionsToExtract[i].modifiers[y].statements);
                        functionResult.modifiers.push(modifier);
                    }    
                }
                
                //finally extract the function's sequences
                functionResult.sequence = this.extractSequence(functionsToExtract[i].statements);
                //if there are no statements, set the functionResult.sequence as an empty sequence array
                if(functionsToExtract[i].statements.length == 0) {
                    functionResult.sequence = [];
                }
                //if modifiers exist, then we have to add the modifier's sequences as part of the function's sequence
                if(functionResult.modifiers.length > 0) { 
                    functionResult.sequence = this.addModifierSequences(functionResult.modifiers, functionResult.sequence); 
                }
                results.push(functionResult);
            }
        } else {
            console.log(error("Error: " + functionName + "() not found within contract"));
            console.log(error("Please check the correct name of the function to proof-read"));
            return;
        }

        /*3 after extracting all function sequences and putting it in "results", wrap it with the contract details*/
        let contract = {};
        contract.name = contractName;
        contract.fields = this.parseContractFields(contractName);
        contract.functions = results;
        contract.payable = false;
        //determine if the contract has any payable function, which marks the contract as "payable"
        for(let i=0;i< results.length; i++) {
            if(results[i].stateMutability === "payable"){
                contract.payable = true;
                break;
            }
        }
        
        console.log(chalk.yellow("Fields"));
        this.printFields(contract.fields);

        //Error check to see if the sequence result exists..
        if(contract.functions) {
            for(let i=0;i<results.length;i++){
                console.log(chalk.yellow("Function: " ) + results[i].name);
                this.printSequence(results[i].sequence);
            }
            return contract;
        } else {
            console.log(error("This contract seems to contain no functions!"));
            return;
        }
    }
};
