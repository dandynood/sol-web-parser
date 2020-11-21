/*jshint esversion: 9*/
/* eslint-env es6 */
const chalk = require('chalk');
const stripAnsi = require('strip-ansi');

const resultCSVexporter = require("./resultCSVexporter.js");

//Will print out the scores of each function
//This will also strip the ANSI formatting of the messages for later in the browser view
printResultsAndTotal = function (contract) {
    for(let i=0;i<contract.functions.length;i++){
        console.log("\nFunction:", chalk.yellow(contract.functions[i].name));
        console.log("Unsecured Calls Score:", contract.functions[i].unsecuredCalls.score, "/", contract.functions[i].unsecuredCalls.scoreLimit);
        for(let y=0;y<contract.functions[i].unsecuredCalls.messages.length;y++) {
            console.log(contract.functions[i].unsecuredCalls.messages[y].msg);
            contract.functions[i].unsecuredCalls.messages[y].msg = stripAnsi(contract.functions[i].unsecuredCalls.messages[y].msg);
        }

        console.log("Mishandled Errors Score:", contract.functions[i].mishandledErrors.score, "/", contract.functions[i].mishandledErrors.scoreLimit);
        for(let y=0;y<contract.functions[i].mishandledErrors.messages.length;y++) {
            console.log(contract.functions[i].mishandledErrors.messages[y].msg);
            contract.functions[i].mishandledErrors.messages[y].msg = stripAnsi(contract.functions[i].mishandledErrors.messages[y].msg);
        }

        console.log("Over-dependency Score:", contract.functions[i].overDependency.score, "/", contract.functions[i].overDependency.scoreLimit);
        for(let y=0;y<contract.functions[i].overDependency.messages.length;y++) {
            console.log(contract.functions[i].overDependency.messages[y].msg);
            contract.functions[i].overDependency.messages[y].msg = stripAnsi(contract.functions[i].overDependency.messages[y].msg);
        }
    }

    if(contract.functions.length > 1) {
        console.log("Dangerous Delegates Score:", contract.dangerousDelegates.score, "/", contract.dangerousDelegates.scoreLimit);
        for(let y=0;y<contract.dangerousDelegates.messages.length;y++) {
            console.log(contract.dangerousDelegates.messages[y].msg);
            contract.dangerousDelegates.messages[y].msg = stripAnsi(contract.dangerousDelegates.messages[y].msg);
        }
    }
};
//Aggregates the results by counting how many positive detections there are
getPositiveDetections = function(contract) {
    contract.positives = {unsecuredCalls:0, mishandledErrors:0, overDependency:0};
    for(let i=0;i<contract.functions.length;i++) {
        if(contract.functions[i].unsecuredCalls.score > 0) { contract.positives.unsecuredCalls++; }
        if(contract.functions[i].mishandledErrors.score > 0) { contract.positives.mishandledErrors++; }
        if(contract.functions[i].overDependency.score > 0) { contract.positives.overDependency++; }
    }
};
//This simply is used to trim down the sequence property from each function for simplicity for the response
trimSequence = function (contract) {
    let result = JSON.parse(JSON.stringify(contract));
    for(let i=0;i<result.functions.length;i++){
        delete result.functions[i].sequence;
    }

    return result;
};

module.exports = {
    //Test the given extracted AST for post write design flaws
    proofRead: function (contractAST) {
        //get a deep copy of the AST
        let contract = JSON.parse(JSON.stringify(contractAST));

        /*Design flaw patterns from /patterns*/
        let unsecuredCalls = require("./patterns/unsecuredCalls.js");
        let mishandledErrors = require("./patterns/mishandledErrors.js");
        let overDependency = require("./patterns/overDependency.js");
        let dangerousDelegates = require("./patterns/dangerousDelegates.js");

        //Test all functions for any unsecured calls via unsecuredCalls.js
        //Results will be added to the object as the "unsecuredCalls" property
        unsecuredCalls.test(contract.functions); 
        mishandledErrors.test(contract.functions);
        overDependency.test(contract.functions);

        //For Dangerous Delegates, it needs the entire contract code to test for delegatecalls. S   kip if testing individual function 
        if(contract.functions.length > 1) {
            dangerousDelegates.test(contract, contractAST.payable);
        }

        //Print results to the shell. Also helps to total up the scores from all functions.
        printResultsAndTotal(contract);
        getPositiveDetections(contract);
        let result = trimSequence(contract);
        return result;

        //Send to the printer to print a CSV result for further processing or documentation
        //resultCSVexporter.printResults(contract);
    }

};