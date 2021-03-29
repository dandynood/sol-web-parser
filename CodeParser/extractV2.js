/*jshint esversion: 9*/
/* eslint-env es6 */
const fs = require('fs');
//for CLI formatting
const chalk = require('chalk');
const error = chalk.bold.red;
const warning = chalk.keyword('orange');
//Necessary  
let dictionary = require("./dictionary.json");
const contractDir = './build/contracts/';

/* Extractor V2, Last updated: 2/1/2021
The purpose of this module is to extract the AST from the Truffle JSON build file of a selected (or all) contracts. This is the first step of the Code Parser
The extract essentially extracts only necessary information about the sequence of statements, and format them neatly for use in the tests.
It will need to extract every field (and their values), function bodies, and function modifiers if any which need to be appended to the sequence of the function.
Also include information about the contract such as payability and name.

The extractor uses recursion as a method to traverse the AST, and the most complex areas of traversal is conditional statements such as If, ElseIf and Loop conditions.
This is because there could be an N number of conditions in these statements, especially complex if those conditions were function calls.
Hence, it may be expected that the Extractor may have problems with complex Solidity code if any.
*/

module.exports = {
    parseDependencies: function(contractDependencies, modifiers) {
        for(let i=0; i < contractDependencies.length; i++) {
            this.parseAST(contractDependencies[i].baseName.name, [], modifiers, true);
        }
    },

    parseDependenciesFields: function(contractDependencies, result) {
        for(let i=0; i < contractDependencies.length; i++) {
            this.parseContractFields(contractDependencies[i].baseName.name, result);
        }
    },

    /*1a. Parses the truffle JSON file to extract the functions AST for use. Returns the contract's functions*/
    //if the function is not found, it will return false as an error flag
    parseAST: function(contractName, functions=[], modifiers=[], dependecies=false) {
        /*Extract all functions from the the AST in the built JSON*/
        let rawBuild = fs.readFileSync(contractDir + contractName + '.json');
        let buildJSON = JSON.parse(rawBuild);
        let nodes = buildJSON.ast.nodes;
        let contractDependencies = [];
        //make sure we get nodes starting from ContractDefinition (to prevent outside pragma directives and others)
        for(let i=0;i<nodes.length;i++) {
            if(nodes[i].nodeType === "ContractDefinition" && nodes[i].name === contractName) {
                //if there is any inherited contracts for this contract, we have to extract their AST first
                if(nodes[i].baseContracts.length > 0) {
                    contractDependencies = nodes[i].baseContracts;
                }
                nodes = nodes[i].nodes;
                //if this contract has any dependencies, we need to obtain the fields and functions of those dependencies as part of the design
                break;
            }
        }

        /*Get all modifiers first*/
        /*If this contract is inheriting any other contract, get any modifiers of that contract to add on to this contract*/
        if(contractDependencies.length > 0) {
            this.parseDependencies(contractDependencies, modifiers);
        }

        //get all modifiers found in this contract
        for (let mod = 0; mod < nodes.length; mod++) {
            if ('body' in nodes[mod] && nodes[mod].nodeType == dictionary.Statements.ModifierDefinition) {
                let modifier = {};
                modifier.name = nodes[mod].name;
                modifier.src = nodes[mod].src;
                modifier.id = nodes[mod].id;
                if(nodes[mod].body) {
                    modifier.statements = nodes[mod].body.statements;
                } else {
                    continue;
                }
                modifiers.push(modifier);
            }
        }
    
        let individualFunction = {};
        if(!dependecies) {
            for (let i = 0; i < nodes.length; i++) {
                if ('body' in nodes[i] && nodes[i].nodeType == dictionary.Statements.FunctionDefinition) {
                    //if this parse is getting the inherited bodies, skip those that are private
                    individualFunction = {};
                    //check the "kind" of function whether it's a constructor or fallback (for 0.5.x and onward)
                    //For older contracts (e.g. 0.4.x), "isConstructor: bool" is used, and constructors can have their own names. Fallbacks can be found out if the name is empty
                    individualFunction.name = (nodes[i].kind === "constructor" ? "constructor" 
                    : nodes[i].isConstructor ? "contructor"
                    : nodes[i].kind === "fallback" ? "fallback" 
                    : nodes[i].name === "" ? "fallback" 
                    : nodes[i].name); //else, just get the name
                    individualFunction.visibility = nodes[i].visibility;
                    //Only get functions that are non-interface or non-abstract. Contract functions with no bodies are meant to be implemented later.
                    individualFunction.stateMutability = nodes[i].stateMutability;
                    if(nodes[i].body) {
                        individualFunction.statements = nodes[i].body.statements;
                    } else {
                        continue;
                    }
                    //get the names of modifiers if it exists
                    individualFunction.modifiers = [];
                    for(let y=0; y < nodes[i].modifiers.length; y++){
                        let functionModifier = {};
                        functionModifier.name =  nodes[i].modifiers[y].modifierName.name;
                        //Get any bodies of modifiers if it exists
                        for (let mod = 0; mod < modifiers.length; mod++) {
                            if (modifiers[mod].name === functionModifier.name) {
                                functionModifier.statements = modifiers[mod].statements;
                            }
                        }
                        individualFunction.modifiers.push(functionModifier);
                    }
                    functions.push(individualFunction);
                }
            }
        }
    },

    /*1b. Get any fields of the contract (this also can include events)*/
    parseContractFields : function (contractName, fields, dependecies=false) {
        /*Get all fields*/
        /*1.Extract all nodes/functions from the the AST in the built JSON*/
        let rawBuild = fs.readFileSync(contractDir + contractName + '.json');
        let buildJSON = JSON.parse(rawBuild);
        let nodes = buildJSON.ast.nodes;
        let contractDependencies = [];
        //make sure we get nodes starting from ContractDefinition (to prevent outside pragma directives and others)
        for(let i=0;i<nodes.length;i++) {
            if(nodes[i].nodeType === "ContractDefinition" && nodes[i].name === contractName) {
                //if there is any inherited contracts for this contract, we have to extract their AST first
                if(nodes[i].baseContracts) {
                    contractDependencies = nodes[i].baseContracts;
                }
                nodes = nodes[i].nodes;
                break;
            }
        }

        //let fields = [];
        /*If this contract is inheriting any other contract, get the structures of that contract to add on to this contract*/
        if(contractDependencies.length > 0) {
            this.parseDependenciesFields(contractDependencies, fields);
        }
        let individualField = {};
        for (let i = 0; i < nodes.length; i++) {
            if(dependecies && nodes[i].visibility === "private") {
                continue;
            }
            individualField = {};
            individualField.src = nodes[i].src;
            individualField.nodeType = nodes[i].nodeType;
            individualField.visibility = nodes[i].visibility;
            if (nodes[i].nodeType === dictionary.Statements.VariableDeclaration && nodes[i].stateVariable) {
                if(nodes[i].value !== null) {
                    individualField.value = [];
                    this.extractConditions(nodes[i].value, individualField.value);
                } 
                individualField.name = nodes[i].name;
                individualField.varID = nodes[i].id;
                individualField.type = nodes[i].typeDescriptions.typeString;
                if(individualField.value && individualField.value.length === 1 && individualField.value[0].condition) {
                    if(individualField.value[0].conditionVarID) { individualField.referencedDeclaration = individualField.value[0].conditionVarID;}
                    individualField.value = individualField.value[0].condition;
                }
                fields.push(individualField);
            } else if (nodes[i].nodeType === dictionary.Statements.StructDefinition) {
                this.parseStructDefinitions(nodes[i], individualField);
                fields.push(individualField);
            } else if (nodes[i].nodeType === dictionary.Statements.EventDefinition) {
                this.parseEventDefinitions(nodes[i], individualField);
                fields.push(individualField);
            } else if (nodes[i].nodeType === dictionary.Statements.EnumDefinition) {
                this.parseEnumDefinitions(nodes[i], individualField);
                fields.push(individualField);
            } else if (nodes[i].nodeType === dictionary.Statements.UsingForDirective) {
                this.parseUsingForDirectives(nodes[i], individualField);
                fields.push(individualField);
            }
        }
    },
    
    /*This simply converts "ExpressionStatements" into more strongly defined types*/
    //Examples include ExpressionStatemen => Assignment or FunctionCall
    //Also add the unique ids of each statement
    parseAnyExpressions: function(statement, result) {
        if(statement.nodeType === dictionary.Statements.Return) {
            result.nodeType = statement.nodeType;
            result.id = statement.id;
        } else if(statement.expression) {
            result.nodeType = statement.expression.nodeType;
            result.id = statement.expression.id;
        } else {
            result.nodeType = statement.nodeType;
            result.id = statement.id;
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

    /* Determines if a member access is using a Solidity global variable based on its type identifier,
    e.g. block.number is using the root identifier "block" whose signature is "t_magic_block". */
    globalVarName : "",
    foundVar: false,
    parseAnyForGlobalVar: function(statementExpression) {
        //first find the root which is the Identifier. If this expression is not the root, uncover via recursion
        if(statementExpression.nodeType !== dictionary.Statements.Identifier && statementExpression.expression) {
            this.parseAnyForGlobalVar(statementExpression.expression);
        //else if it is the root, determine the global var via its signature
        } else if (statementExpression.nodeType === dictionary.Statements.Identifier && statementExpression.name !== dictionary.GlobalVar.Now) {
            let signature = statementExpression.typeDescriptions.typeIdentifier; //get signature
            let typeValues = Object.values(dictionary.TypeIdentifier); //get all values from this dictionary.TypeIdentifier

            //Cross reference signature if exists in the dictionary entry
            for(let i = 0; i  < typeValues.length; i++){
                if(signature.includes(typeValues[i])) {
                    //if the signature corresponds to a specific opcode, return that specific opcode instead 
                    //(e.g. return Call or Send instead of just plain FunctionCall in the expression)
                    let type = Object.keys(dictionary.TypeIdentifier)[Object.values(dictionary.TypeIdentifier).indexOf(typeValues[i])];
                    //for each root Identifier, they have a type signature e.g. "Msg" or "Tx"
                    this.globalVarName += type + ".";
                    break;
                }
            }
        //if we found out this is a "now" identifier e.g. block.timestamp, add the name
        } else if (statementExpression.nodeType === dictionary.Statements.Identifier && statementExpression.name === dictionary.GlobalVar.Now) {
            this.globalVarName = statementExpression.name;
        }
        //Once you're done getting the root identifier's type name, get the rest of the member access e.g. msg.<member>.<member> and so on
        if(statementExpression.nodeType === dictionary.Statements.MemberAccess) {
            this.globalVarName += statementExpression.memberName + ".";
        }
    },

    /*In the case a struct has been defined somewhere in the fields or in functions*/
    parseStructDefinitions: function(structStatement, result) {
        result.name = structStatement.name;
        result.varID = structStatement.id;
        result.type = "struct";
        result.members = [];
        for(let i=0; i < structStatement.members.length; i++) {
            let member = {};
            member.name = structStatement.members[i].name;
            member.varID = structStatement.members[i].id;
            member.type = structStatement.members[i].typeDescriptions.typeString;
            result.members.push(member);
        }
    },

    /*Handles event definitions in fields, get parameters and types accordingly*/
    parseEventDefinitions: function(eventStatement, result){
        result.name = eventStatement.name;
        result.varID = eventStatement.id;
        result.type = "event";
        result.parameters = [];
        //if any arguments are present in the function call, get them
        if(eventStatement.parameters.parameters) {
            for(let arg=0; arg < eventStatement.parameters.parameters.length; arg++) {
                let param = eventStatement.parameters.parameters[arg];
                let extractedParam = {};
                extractedParam.name = param.name;
                extractedParam.id = param.id;
                extractedParam.type = param.typeName.typeDescriptions.typeString;
                result.parameters.push(extractedParam);
            }
        }
    },

    /*For enums statements defined in fields. They are fairly simple, so not much processing*/
    parseEnumDefinitions: function(enumStatement, result) {
        result.name = enumStatement.name;
        result.varID = enumStatement.id;
        result.type = "enum";
        result.members = enumStatement.members;
    },

    /*For statements e.g. using <library> for <library.member>. Get the library names, id, types, and member name (typeName) accordingly*/
    parseUsingForDirectives: function(usingForStatement, result) {
        result.libraryName = usingForStatement.libraryName.name;
        result.libraryID = usingForStatement.libraryName.id;
        result.referencedDeclaration = usingForStatement.typeName.referencedDeclaration;
        result.type = usingForStatement.typeName.typeDescriptions.typeString;
        result.name = usingForStatement.typeName.name;
    },

    /*To handle array and mapping index access statements e.g. array[i].*/
    parseIndexAccesses: function(indexAccessStatement, result) {
        result.name = this.parseAnyNameOrMemberAccess(indexAccessStatement.baseExpression);
        result.varID = indexAccessStatement.baseExpression.referencedDeclaration;
        result.type = indexAccessStatement.baseExpression.typeDescriptions.typeString;
        result.arguments = [];
        this.extractConditions(indexAccessStatement.indexExpression, result.arguments);
    },

    /*This helps parse any variable name, normal or those of member access*/
    parseAnyNameOrMemberAccess : function(expression, result=""){
        if(expression.nodeType === dictionary.Statements.MemberAccess) {
            //concat e.g. <member>.<previousMember> and so on
            if(result.length > 0) { 
                result = expression.memberName + result;
            } else {
                //if just started, start with .<member>
                result = "." + expression.memberName;
            }
            //unviel the next member/root in the expression property
            result = this.parseAnyNameOrMemberAccess(expression.expression, result);
            return result;
        //If this expression is some kind of root i.e. an Identifier, get the name of this identifier
        } else if (expression.nodeType === dictionary.Statements.Identifier) {
            //concat e.g. <root>.<previousMember> and so on
            //if the result was "" before, it's just a lone variable
            result = expression.name + result;
            return result;
        }
    },

    /*Parses Assigmemnt statements. Each statement as a assignment[] array with the declarations, and a initialValue[] array with the values.
    These are arrays due to the existence of Tuples in Solidity e.g. (y,x,...) which are "components" in the statement */
    parseAssignments: function(statement, result) {
        result.assignments = [];
        result.initialValue = [];
        result.operator = statement.expression.operator;
        //get assignments (left hand side)
        //if this is a tuple assignment e.g. (x,y) = ..., get the left hand variables
        if(statement.expression.leftHandSide.components) {
            let components = statement.expression.leftHandSide.components;
            for(let asgn=0;asgn < components.length; asgn++) {
                //skip null tuple components
                if(components[asgn]) {
                    let assignment = {};
                    assignment.name = this.parseAnyNameOrMemberAccess(components[asgn]);
                    assignment.varID = components[asgn].referencedDeclaration;
                    assignment.type = components[asgn].typeDescriptions.typeString;
                    result.assignments.push(assignment);
                }
            }
        //if this is assigning an array or mapping with and index access e.g. array[2] = ...
        } else if (statement.expression.leftHandSide.nodeType === dictionary.Statements.IndexAccess) {
            let assignment = {};
            this.parseIndexAccesses(statement.expression.leftHandSide, assignment);
            result.assignments.push(assignment);
        //if just a normal single variable e.g. y = ...
        } else {
            let assignment = {};
            assignment.name = this.parseAnyNameOrMemberAccess(statement.expression.leftHandSide);
            assignment.varID = statement.expression.leftHandSide.referencedDeclaration;
            assignment.type = statement.expression.leftHandSide.typeDescriptions.typeString;
            result.assignments.push(assignment); 
        }
        //get the values (initiValue) from the right hand side
        //if you have a tuple right hand side assignment e.g. ... = (1,2) get the initialValues per tuple member
        if(statement.expression.rightHandSide.components) { 
            let components = statement.expression.rightHandSide.components;
            for(let comp=0;comp<components.length;comp++) {
                if(components[comp]) {
                    this.extractConditions(components[comp], result.initialValue);
                }
            }
        //if a plain single assignment value e.g. ... = 1. 
        } else {
            this.extractConditions(statement.expression.rightHandSide, result.initialValue);
        }
    },

    /*Parse Variable Declaration statements. The statement has a declarations[] array for the declared variables, and a initialValue[] array for any values assigned
    The reason for arrays is that tuples exist in Solidity e.g. (bool success, bytes memory data), which exists in "components" */
    parseVariableDeclarations: function (statement, result) {
        result.declarations = [];
        result.initialValue = [];
        result.operator = "";
        //Get each declaration's name, var id and type
        for(let dec=0;dec < statement.declarations.length; dec++){
            //skip null declarations 
            if(statement.declarations[dec]) {
                let declaration = {};
                declaration.name = statement.declarations[dec].name;
                declaration.varID = statement.declarations[dec].id;
                declaration.type = statement.declarations[dec].typeDescriptions.typeString;
                result.declarations.push(declaration);
            }
        }
        //if an initialValue exists..
        if(statement.initialValue) {
            result.operator = "=";
            //if the initialValue is a tuple, extract according for each declaration. The [dec] position can work for intialValue.components[] as well
            if(statement.initialValue.components || statement.initialValue.nodeType === dictionary.Statements.TupleExpression) {
                for(let comp=0;comp<statement.initialValue.components.length;comp++) {
                    if(statement.initialValue.components[comp]) {
                        this.extractConditions(statement.initialValue.components[comp], result.initialValue);
                    }
                }
            } else {
            //else if there is only 1 initialValue (e.g. from a function call or a "call" interaction)
                this.extractConditions(statement.initialValue, result.initialValue);
            }
        }
    },

    extractLeftRight : function(expression, result) {

    },
    
    extractConditionsV2: function(ifCondition, conditions = [], condition={}) {
        if(ifCondition) {
            //if it's a pure value like "true" or "false" or integers
            if(ifCondition.value){
                condition.condition = ifCondition.value;
                condition.isPure = ifCondition.isPure;
                condition.type = ifCondition.typeDescriptions.typeString;
            //if this is some variable (no unary operator used, e.g. a boolean variable)
            } else if(ifCondition.name && ifCondition.referencedDeclaration) {
                condition.condition = ifCondition.name;
                condition.conditionVarID = ifCondition.referencedDeclaration;
                condition.type = ifCondition.typeDescriptions.typeString;
            //else if it is Unary operation on one variable...
            } else if (ifCondition.subExpression) {
                condition.unary = ifCondition.operator; //get the operator e.g. ++, -- or !
                condition.prefix = ifCondition.prefix; //true if prefix, else false which is postfx
                this.extractConditions(ifCondition.subExpression, conditions, condition); //gets the rest of the info whether it be a value, names or other
            //if it's a single function call, determine if it's an opcode e.g. Send
            } else if (ifCondition.expression && ifCondition.nodeType === dictionary.Statements.FunctionCall) {
                condition.condition = this.parseAnyForOpcode(ifCondition);
                condition.arguments = [];
                if(ifCondition.arguments) {
                    for(let arg=0; arg < ifCondition.arguments.length; arg++) {
                        this.extractConditions(ifCondition.arguments[arg], condition.arguments);
                    }
                }
            //if the statement is some member access such as block.timestamp, msg.sender or msg.data, extract accordingly
            } else if (ifCondition.nodeType === dictionary.Statements.MemberAccess) {
                condition.condition = this.parseAnyNameOrMemberAccess(ifCondition);
                condition.conditionVarID = ifCondition.referencedDeclaration;
            //if the statement is some index access, e.g. array[i], extract accordingly
            } else if (ifCondition.nodeType === dictionary.Statements.IndexAccess) {
                condition.condition = this.parseAnyNameOrMemberAccess(ifCondition.baseExpression);
                condition.conditionVarID = ifCondition.baseExpression.referencedDeclaration;
                condition.type = ifCondition.baseExpression.typeDescriptions.typeString;
                condition.arguments = [];
                this.extractConditions(ifCondition.indexExpression, condition.arguments);
            }

            //if we are dealing with a left and right expression (also with more left and rights on the right)
            if(ifCondition.leftExpression && ifCondition.rightExpression) {
                
            }
            conditions.push(condition);
        }
    },

    /*This extracts all the conditions neatly for each if/else if statement. It is rather long as it considers tuples and subexpressions for both left and right conditions*/
    extractConditions : function(ifCondition, conditions = [], condition = {}){
        //let condition = {};
        if(ifCondition) {
            //if it's a pure value like "true" or "false" or integers
            if(ifCondition.value){
                condition.condition = ifCondition.value;
                condition.isPure = ifCondition.isPure;
                condition.type = ifCondition.typeDescriptions.typeString;
                conditions.push(condition);
            //if this is some variable (no unary operator used, e.g. a boolean variable)
            } else if(ifCondition.name && ifCondition.referencedDeclaration) {
                condition.condition = ifCondition.name;
                condition.conditionVarID = ifCondition.referencedDeclaration;
                condition.type = ifCondition.typeDescriptions.typeString;
                conditions.push(condition);
            //else if it is Unary operation on one variable...
            } else if (ifCondition.subExpression) {
                condition.unary = ifCondition.operator; //get the operator e.g. ++, -- or !
                condition.prefix = ifCondition.prefix; //true if prefix, else false which is postfx
                this.extractConditions(ifCondition.subExpression, conditions, condition);
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
            //if the statement is some member access such as block.timestamp, msg.sender or msg.data, extract accordingly
            } else if (ifCondition.nodeType === dictionary.Statements.MemberAccess) {
                //this.globalVarName = "";
                //this.parseAnyForGlobalVar(ifCondition);
                //condition.condition = this.globalVarName.substring(0, this.globalVarName.length - 1);
                condition.condition = this.parseAnyNameOrMemberAccess(ifCondition);
                condition.conditionVarID = ifCondition.referencedDeclaration;
                conditions.push(condition);
            //if the statement is some index access, e.g. array[i], extract accordingly
            } else if (ifCondition.nodeType === dictionary.Statements.IndexAccess) {
                condition.condition = this.parseAnyNameOrMemberAccess(ifCondition.baseExpression);
                condition.conditionVarID = ifCondition.baseExpression.referencedDeclaration;
                condition.type = ifCondition.baseExpression.typeDescriptions.typeString;
                condition.arguments = [];
                this.extractConditions(ifCondition.indexExpression, condition.arguments);
                conditions.push(condition);
            }

            if(ifCondition.leftExpression && ifCondition.rightExpression) {
                /*Traverse Left*/
                //A subexpression within the left expression can be a unary operation like a prefix + name
                if(ifCondition.leftExpression.subExpression){
                    condition.leftUnary = ifCondition.leftExpression.operator;
                    condition.leftPrefix = ifCondition.leftExpression.prefix;
                    if(ifCondition.leftExpression.subExpression.referencedDeclaration && ifCondition.leftExpression.subExpression.name) {
                        condition.left = ifCondition.leftExpression.subExpression.name;
                        condition.leftVarID = ifCondition.leftExpression.subExpression.referencedDeclaration;
                        condition.leftType = ifCondition.leftExpression.subExpression.typeDescriptions.typeString;
                    } else if (ifCondition.leftExpression.subExpression.value) { 
                        condition.left = ifCondition.leftExpression.subExpression.value; 
                        condition.leftType = ifCondition.leftExpression.subExpression.typeDescriptions.typeString;
                    } else if (ifCondition.leftExpression.subExpression.nodeType === dictionary.Statements.FunctionCall) {
                        condition.left = this.parseAnyForOpcode(ifCondition.leftExpression.subExpression);
                        condition.leftArguments = [];
                        if(ifCondition.leftExpression.subExpression.arguments) {
                            for(let arg=0; arg < ifCondition.leftExpression.subExpression.arguments.length; arg++) {
                                this.extractConditions(ifCondition.leftExpression.subExpression.arguments[arg], condition.leftArguments);
                            }
                        }
                    } else if (ifCondition.leftExpression.subExpression.nodeType === dictionary.Statements.MemberAccess) {
                        //this.globalVarName = "";
                        //this.parseAnyForGlobalVar(ifCondition.leftExpression.subExpression);
                        //condition.left = this.globalVarName.substring(0, this.globalVarName.length - 1);
                        condition.left = this.parseAnyNameOrMemberAccess(ifCondition.leftExpression.subExpression);
                        condition.leftVarID = ifCondition.leftExpression.subExpression.referencedDeclaration;
                        condition.leftType = ifCondition.leftExpression.subExpression.typeDescriptions.typeString;
                    //if this is an index expression
                    } else if (ifCondition.leftExpression.subExpression.nodeType === dictionary.Statements.IndexAccess) {
                        condition.left = this.parseAnyNameOrMemberAccess(ifCondition.leftExpression.subExpression.baseExpression);
                        condition.leftVarID = ifCondition.leftExpression.subExpression.baseExpression.referencedDeclaration;
                        condition.leftType = ifCondition.leftExpression.subExpression.baseExpression.typeDescriptions.typeString;
                        condition.leftArguments = [];
                        this.extractConditions(ifCondition.leftExpression.subExpression.indexExpression, condition.leftArguments);
                    }
                }            
                //Get Left whether it be a variable name or a value, or a functionCall and its arguments
                if(ifCondition.leftExpression.referencedDeclaration && ifCondition.leftExpression.name) {
                    condition.left = ifCondition.leftExpression.name;
                    condition.leftVarID = ifCondition.leftExpression.referencedDeclaration;
                    condition.leftType = ifCondition.leftExpression.typeDescriptions.typeString;
                } else if (ifCondition.leftExpression.value) { 
                    condition.left = ifCondition.leftExpression.value; 
                    condition.leftType = ifCondition.leftExpression.typeDescriptions.typeString;
                } else if (ifCondition.leftExpression.nodeType === dictionary.Statements.FunctionCall) {
                    condition.left = this.parseAnyForOpcode(ifCondition.leftExpression);
                    condition.leftArguments = [];
                    if(ifCondition.leftExpression.arguments) {
                        for(let arg=0; arg < ifCondition.leftExpression.arguments.length; arg++) {
                            this.extractConditions(ifCondition.leftExpression.arguments[arg], condition.leftArguments);
                        }
                    }
                } else if (ifCondition.leftExpression.nodeType === dictionary.Statements.MemberAccess) {
                    //this.globalVarName = "";
                    //this.parseAnyForGlobalVar(ifCondition.leftExpression);
                    //condition.left = this.globalVarName.substring(0, this.globalVarName.length - 1);
                    condition.left = this.parseAnyNameOrMemberAccess(ifCondition.leftExpression);
                    condition.leftVarID = ifCondition.leftExpression.referencedDeclaration;
                    condition.leftType = ifCondition.leftExpression.typeDescriptions.typeString;
                } else if (ifCondition.leftExpression.nodeType === dictionary.Statements.IndexAccess) {
                    condition.left = this.parseAnyNameOrMemberAccess(ifCondition.leftExpression.baseExpression);
                    condition.leftVarID = ifCondition.leftExpression.baseExpression.referencedDeclaration;
                    condition.leftType = ifCondition.leftExpression.baseExpression.typeDescriptions.typeString;
                    condition.leftArguments = [];
                    this.extractConditions(ifCondition.leftExpression.indexExpression, condition.leftArguments);
                }
                /*Traverse Right*/
                //A subexpression within the right expression can be a unary operation like a prefix + name
                if(ifCondition.rightExpression.subExpression){
                    condition.rightUnary = ifCondition.rightExpression.operator;
                    condition.rightPrefix = ifCondition.rightExpression.prefix;
                    if(ifCondition.rightExpression.subExpression.referencedDeclaration && ifCondition.rightExpression.subExpression.name) {
                        condition.right = ifCondition.rightExpression.name;
                        condition.rightVarID = ifCondition.rightExpression.subExpression.referencedDeclaration;
                        condition.rightType = ifCondition.rightExpression.subExpression.typeDescriptions.typeString;
                    } else if (ifCondition.rightExpression.subExpression.value) { 
                        condition.right = ifCondition.rightExpression.subExpression.value;
                        condition.rightType = ifCondition.rightExpression.subExpression.typeDescriptions.typeString; 
                    } else if (ifCondition.rightExpression.subExpression.nodeType === dictionary.Statements.FunctionCall) {
                        condition.right = this.parseAnyForOpcode(ifCondition.rightExpression.subExpression);
                        condition.rightArguments = [];
                        if(ifCondition.rightExpression.subExpression.arguments) {
                            for(let arg=0; arg < ifCondition.rightExpression.subExpression.arguments.length; arg++) {
                                this.extractConditions(ifCondition.rightExpression.subExpression.arguments[arg], condition.rightArguments);
                            }
                        }
                    } else if (ifCondition.rightExpression.subExpression.nodeType === dictionary.Statements.MemberAccess) {
                        //this.globalVarName = "";
                        //this.parseAnyForGlobalVar(ifCondition.rightExpression.subExpression);
                        //condition.right = this.globalVarName.substring(0, this.globalVarName.length - 1);
                        condition.right = this.parseAnyNameOrMemberAccess(ifCondition.rightExpression.subExpression);
                        condition.rightVarID = ifCondition.rightExpression.subExpression.referencedDeclaration;
                        condition.rightType = ifCondition.rightExpression.subExpression.typeDescriptions.typeString;
                    } else if (ifCondition.rightExpression.subExpression.nodeType === dictionary.Statements.IndexAccess) {
                        condition.right = this.parseAnyNameOrMemberAccess(ifCondition.rightExpression.subExpression.baseExpression);
                        condition.rightVarID = ifCondition.rightExpression.subExpression.baseExpression.referencedDeclaration;
                        condition.rightType = ifCondition.rightExpression.subExpression.baseExpression.typeDescriptions.typeString;
                        condition.rightArguments = [];
                        this.extractConditions(ifCondition.rightExpression.subExpression.indexExpression, condition.rightArguments);
                    }
                } 
                //Get Right whether it be a variable name or value or a functionCall
                if(ifCondition.rightExpression.referencedDeclaration && ifCondition.rightExpression.name) {
                    condition.right = ifCondition.rightExpression.name;
                    condition.rightVarID = ifCondition.rightExpression.referencedDeclaration; 
                    condition.rightType = ifCondition.rightExpression.typeDescriptions.typeString;
                } else if (ifCondition.rightExpression.value) { 
                    condition.right = ifCondition.rightExpression.value; 
                    condition.rightType = ifCondition.rightExpression.typeDescriptions.typeString;
                } else if (ifCondition.rightExpression.nodeType === dictionary.Statements.FunctionCall) {
                    condition.right = this.parseAnyForOpcode(ifCondition.rightExpression);
                    condition.rightArguments = [];
                    if(ifCondition.rightExpression.arguments) {
                        for(let arg=0; arg < ifCondition.rightExpression.arguments.length; arg++) {
                            this.extractConditions(ifCondition.rightExpression.arguments[arg], condition.rightArguments);
                        }
                    }
                } else if (ifCondition.rightExpression.nodeType === dictionary.Statements.MemberAccess) {
                    //this.globalVarName = "";
                    //this.parseAnyForGlobalVar(ifCondition.rightExpression);
                    //condition.right = this.globalVarName.substring(0, this.globalVarName.length - 1);
                    condition.right = this.parseAnyNameOrMemberAccess(ifCondition.rightExpression);
                    condition.rightVarID = ifCondition.rightExpression.referencedDeclaration;
                    condition.rightType = ifCondition.rightExpression.typeDescriptions.typeString;
                } else if (ifCondition.rightExpression.nodeType === dictionary.Statements.IndexAccess) {
                    condition.right = this.parseAnyNameOrMemberAccess(ifCondition.rightExpression.baseExpression);
                    condition.rightVarID = ifCondition.rightExpression.baseExpression.referencedDeclaration;
                    condition.rightType = ifCondition.rightExpression.baseExpression.typeDescriptions.typeString;
                    condition.rightArguments = [];
                    this.extractConditions(ifCondition.rightExpression.indexExpression, condition.rightArguments);
                }

                //Traverse Left if there is another left expression
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
        }
    },

    /*Traverses and extracts any if any else ifs or elses exists in the if statements, they are deeper levels of the AST of the IfStatement root*/
    extractElseIfStatements: function(elseIfStatements, sequence){
        let statement = {};
        statement.id = elseIfStatements.id; //get the unique statement ID of this ElseIf/Else
        //If an else if, it will have a truebody and falsebody
        if (elseIfStatements.trueBody) {
            //if ElseIf has statements
            if(elseIfStatements.trueBody.statements) {
                statement.trueBody = this.extractSequence(elseIfStatements.trueBody.statements);
            //else if it only has one statement
            } else {
                statement.trueBody = this.extractSequence([elseIfStatements.trueBody]);
            }
            statement.nodeType = "ElseIfStatement";
            statement.conditions = [];
            //extract the else if conditions
            this.extractConditions(elseIfStatements.condition, statement.conditions);
            sequence.push(statement); //push ElseIf  next in front of any preceeding If/ElseIf statements
            //if another else/elseif exist, repeat
            if(elseIfStatements.falseBody) {
                this.extractElseIfStatements(elseIfStatements.falseBody, sequence);
            }

        } 

        //if no other truebody exist within the falsebody and only statements exist, it is an else statement
        if (!elseIfStatements.trueBody){
            statement.nodeType = "ElseStatement";
            //add a trueBody to this ElseStatement to traverse. If there is a statements array in this Else body, extract them
            if(elseIfStatements.statements) {
                statement.trueBody = this.extractSequence(elseIfStatements.statements);
            //else if no statements in the Else body but one single statement (not wrapped), add that to the trueBody
            } else {
                statement.trueBody = this.extractSequence([elseIfStatements]);
            }
            sequence.push(statement); //push the Else next in front of any preceeding If/ElseIf statements after getting its body
        }
    },

    /*2. Extracts all the nodeTypes and any sub-blocks (via recursion) of the function*/
    extractSequence: function (functionStatements) { 
        /*3. Correctly extract the sequence in readable form by nodeType*/
        //Make sure to extract from all trueBodys if they exists
        let sequence = [];
        for (let i = 0; i < functionStatements.length; i++) {
            let statement = {};
            if (functionStatements[i].nodeType) {
                statement.src = functionStatements[i].src;
                this.parseAnyExpressions(functionStatements[i], statement); //get the specific type of statement from any Expression type statement

                //If a function call, determine if it is an opcode by using the function expression
                if(statement.nodeType === dictionary.Statements.FunctionCall) {
                    this.parseAnyForOpcode(functionStatements[i].expression, statement);
                    statement.arguments = [];
                    //if any arguments are present in the function call, get them
                    if(functionStatements[i].expression.arguments) {
                        for(let arg=0; arg < functionStatements[i].expression.arguments.length; arg++) {
                            this.extractConditions(functionStatements[i].expression.arguments[arg], statement.arguments);
                        }
                    }
                }
                //If this is a EmitStatement (e.g. emit event), then get the arguments similar to function calls
                if(statement.nodeType === dictionary.Statements.EmitStatement) {
                    statement.arguments = [];
                    statement.name = functionStatements[i].eventCall.expression.name;
                    //if any arguments are present in the function call, get them
                    if(functionStatements[i].eventCall.arguments) {
                        for(let arg=0; arg < functionStatements[i].eventCall.arguments.length; arg++) {
                            this.extractConditions(functionStatements[i].eventCall.arguments[arg], statement.arguments);
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
                //For return statements, get their conditions or return values. Return statements can also return tuples
                if(statement.nodeType === dictionary.Statements.Return){
                    statement.conditions = [];
                    if(functionStatements[i].expression) {
                        //if any tuple components exist
                        if(functionStatements[i].expression.components) { 
                            let components = functionStatements[i].expression.components;
                            for(let comp=0;comp<components.length;comp++) {
                                if(components[comp]) {
                                    this.extractConditions(components[comp], statement.conditions);
                                }
                            }
                        } else { 
                            this.extractConditions(functionStatements[i].expression, statement.conditions);
                        }
                    }
                }

                //Parse unary statements such as increments and decrements
                if(statement.nodeType === dictionary.Statements.UnaryOperation) {
                    statement.conditions = [];
                    //if any conditions exist
                    if(functionStatements[i].expression) {
                        this.extractConditions(functionStatements[i].expression, statement.conditions);
                    }
                }

                //Parse binary statements
                if(statement.nodeType === dictionary.Statements.BinaryOperation) {
                    statement.conditions = [];
                    //if any conditions exist
                    if(functionStatements[i].expression) {
                        this.extractConditions(functionStatements[i].expression, statement.conditions);
                    }
                }

                //Assignment statements, get the name, data type of the left hand side, and the var ID.
                if(statement.nodeType === dictionary.Statements.Assignment) {
                    this.parseAssignments(functionStatements[i], statement);
                } 

                //Variable Declaration Statements
                if(statement.nodeType === dictionary.Statements.VariableDeclarationStatement) {
                    this.parseVariableDeclarations(functionStatements[i], statement);
                }

                if(statement.nodeType === dictionary.Statements.IndexAccess) {
                    this.parseIndexAccesses(functionStatements[i].expression, statement);
                }

                //Member access statements, check for any global var such as block.timestamp and tx.origin
                if(statement.nodeType === dictionary.Statements.MemberAccess){
                    //this.globalVarName = "";
                    //this.parseAnyForGlobalVar(functionStatements[i].expression);
                    //statement.nodeType = this.globalVarName.substring(0, this.globalVarName.length - 1);
                    statement.name = this.parseAnyNameOrMemberAccess(functionStatements[i].expression);
                    statement.varID = functionStatements[i].expression.referencedDeclaration;
                }

                //If the statement is some "identifier", it could be a Now alias of block.timestamp
                if (statement.nodeType === dictionary.Statements.Identifier && functionStatements[i].expression.name === dictionary.GlobalVar.Now) {
                    statement.nodeType = functionStatements[i].expression.name;
                }

                //If an exists if-statement or similar, extract all statements in its subblocks via recursion
                if(functionStatements[i].trueBody){
                    //The result would be an object such as { nodeType:"IfStatement", statements: [...]}
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
                }

                //If there exist any loop body in the statement (such as for, while or do while), extract the statements in the sub block and loop conditions
                if(functionStatements[i].body) {
                    //The result would be an object such as { nodeType:"ForStatement", subBlock: [...]}
                    //if it's a single statement, there is no body.statements, but just the body {} object
                    let subStatements;
                    if(functionStatements[i].body.statements) {
                        subStatements = functionStatements[i].body.statements;
                    } else {
                        subStatements = [functionStatements[i].body];
                    }
                    statement.subBlock = this.extractSequence(subStatements); //recursion call
                    //also get info on the loop's conditions
                    statement.conditions = [];
                    this.extractConditions(functionStatements[i].condition, statement.conditions);

                    if(statement.nodeType === dictionary.Statements.ForStatement) {
                        statement.loopExpression = [];
                        statement.initializationExpression = [];
                        if(functionStatements[i].loopExpression) {
                            this.extractConditions(functionStatements[i].loopExpression.expression, statement.loopExpression);
                        }
                        if(functionStatements[i].initializationExpression) {
                            statement.initializationExpression = this.extractSequence([functionStatements[i].initializationExpression]);
                        }
                    }
                }

                /*Finally push the statement into the sequence array*/
                sequence.push(statement); //push at the end

                //If an ElseIf/Else is found next, add that next in the sequence
                if(functionStatements[i].falseBody) {
                    this.extractElseIfStatements(functionStatements[i].falseBody, sequence);
                }
            }
        }
        
        return sequence;
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

    printFields : function (fields) {
        for(let i = 0; i < fields.length; i++) {
            //if an initial value exists, print "<nodeType> = <initialValue>". This is important for Assignments or VariableDeclarations
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
    
    /*Prints out all sequences neatly from the array of objects*/
    //uses recursion for sub-blocks
    printSequence: function(sequence, tabsNeeded=0) {
        let tabString = "";
        for(let tabs=0;tabs<tabsNeeded;tabs++) tabString = tabString + "\t";
        for(let i = 0; i < sequence.length; i++) {
            //if an initial value exists, print "<nodeType> = <initialValue>". This is important for Assignments or VariableDeclarations
            if(sequence[i].initialValue) {
                //if the value is a binary operation expression, it be an array. Print as <left> <operator> <right>
                let string = "";
                let leftSide = (sequence[i].declarations ? sequence[i].declarations
                : sequence[i].assignments ? sequence[i].assignments : []);
                for(let ii=0; ii < leftSide.length; ii++) {
                    string = string + leftSide[ii].name;
                    if(ii+1 < leftSide.length) {
                        string = string + ", ";
                    }
                }
                string = string + " " + sequence[i].operator + " ";
                for(let y=0; y < sequence[i].initialValue.length; y++){
                    if(sequence[i].initialValue[y].condition) {string += sequence[i].initialValue[y].condition; }
                    if(sequence[i].initialValue[y].left) {string += sequence[i].initialValue[y].left; }
                    if(sequence[i].initialValue[y].operator) {string += " " + sequence[i].initialValue[y].operator + " "; }
                    if(sequence[i].initialValue[y].right) {string += sequence[i].initialValue[y].right; }
                }
                console.log(sequence[i].indexNum, tabString + sequence[i].nodeType + " " + string);
            } else {
                if(sequence[i].nodeType === dictionary.Statements.ElseIfStatement || sequence[i].nodeType === dictionary.Statements.ElseStatement) {
                    console.log(sequence[i].indexNum,  tabString + sequence[i].nodeType, sequence[i].parentIf);
                } else {
                    console.log(sequence[i].indexNum,  tabString + sequence[i].nodeType);
                }
            }

            //add a tab if a sub block is found for formatting
            if(sequence[i].subBlock) {
                if(sequence[i].subBlock.length !== 0) {
                    tabsNeeded++; //move statements forward
                    this.printSequence(sequence[i].subBlock, tabsNeeded);
                    tabsNeeded--; //move back after the sub block
                } else {
                    console.log("\t", "Empty");
                }
            }
            //if any ifstatements are found via truebody, unpack
            if(sequence[i].trueBody){
                tabsNeeded++; //move the sub statements forward
                this.printSequence(sequence[i].trueBody, tabsNeeded);
                tabsNeeded--; //after print, move back again
            }
        }
    },

    addIndexes : function(sequence, dim=0, carryOver=[], parentIf=[]) {
        for(let i = 0; i < sequence.length; i++) {
            //undefined is the initial starting point
            if(typeof carryOver[dim] === 'undefined') { 
                carryOver[dim] = i; 
            } else { 
                carryOver[dim]++; 
            }
            sequence[i].indexNum = JSON.parse(JSON.stringify(carryOver));

            if(sequence[i].nodeType === dictionary.Statements.ElseIfStatement || sequence[i].nodeType === dictionary.Statements.ElseStatement) {
                sequence[i].parentIf = parentIf;
            }

            if(sequence[i].subBlock) {
                if(sequence[i].subBlock.length !== 0) {
                    this.addIndexes(sequence[i].subBlock, dim+1, JSON.parse(JSON.stringify(carryOver)));
                }
            }
            //if any ifstatements are found via truebody, unpack
            if(sequence[i].trueBody){
                if(sequence[i].nodeType === dictionary.Statements.IfStatement) {
                    parentIf = carryOver[dim];
                }
                this.addIndexes(sequence[i].trueBody, dim+1, JSON.parse(JSON.stringify(carryOver)));
            }
        }        
    },

    /*Function used by proof-read.js main(), handles step by step process*/
    extraction: function (contractName) {
        console.log(chalk.underline.blue("Extraction intiated"));
        console.log(chalk.yellow("Contract: ") + contractName);
        console.log(chalk.yellow("Extracting All functions"));

        /*1.Call parseAST to extract and find the function*/
        let functionsToExtract = [];
        this.parseAST(contractName, functionsToExtract);
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
                        //if this modifier have any statements, extract and add on
                        if(functionsToExtract[i].modifiers[y].statements) {
                            modifier.sequence = this.extractSequence(functionsToExtract[i].modifiers[y].statements);
                            functionResult.modifiers.push(modifier);
                        }
                    }    
                }
                
                //finally extract the function's sequences
                //if there are no statements, set the functionResult.sequence as an empty sequence array
                if(functionsToExtract[i].statements.length == 0) {
                    functionResult.sequence = [];
                } else {
                    functionResult.sequence = this.extractSequence(functionsToExtract[i].statements);
                }

                //if modifiers exist, then we have to add the modifier's sequences as part of the function's sequence
                if(functionResult.modifiers.length > 0) { 
                    functionResult.sequence = this.addModifierSequences(functionResult.modifiers, functionResult.sequence); 
                }
                
                //finally add index numbers to the statements for reference
                this.addIndexes(functionResult.sequence);
                results.push(functionResult);
            }
        }

        /*3 after extracting all function sequences and putting it in "results", wrap it with the contract details*/
        let contract = {};
        contract.name = contractName;
        contract.fields = [];
        this.parseContractFields(contractName, contract.fields);
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
            //print out
            for(let i=0;i<results.length;i++) {
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
