/*jshint esversion: 9*/
/* eslint-env es6 */
const chalk = require('chalk');
const jsonexport = require('jsonexport');
const error = chalk.bold.red;
const warning = chalk.keyword('orange');

module.exports = {

    //Decolorize Chalk-colored text before exporting to CSV
    decolor: function (contract) {
        //console.log(functionAST);
        for(let i=0;i<contract.functions.length;i++){
            contract.functions[i].mishandledErrors.message = chalk.reset(contract.functions[i].mishandledErrors.message);
            contract.functions[i].overDependency.message = chalk.reset(contract.functions[i].overDependency.message);
            contract.functions[i].unsecuredCalls.message = chalk.reset(contract.functions[i].unsecuredCalls.message);

            //console.log("Testing decolor", functionAST[i].mishandledErrors.message);
        }

        if(contract.functions.length > 1) {
            chalk.reset(contract.dangerousDelegates.message);
        }
    },

    //Compile results of the test into a full report score sheet for CSV export
    //Each contract function will have 3 adjacent columns for the design flaws, with the score
    //At the bottom of each 4 columns will be the total of each of the 3 design flaws + the Dangerous Delegate total score adjacent to it
    compileResults: function(functionAST){

    },

    //Test the given extracted AST for post write design flaws
    printResults: function (contract) {
        //get a deep copy of the tested functionsToTest from proofread.js
        this.decolor(contract);
        //console.log(contract);
    }

};

/*
Expected output in CSV

Contract    |   <name>          |
Function    |   Unsecured Call  |   Mishandled Error    |   Over-depedency  |   Dangerous Delegate  |  
<function1> |   <score>         |                       |                   |   <blank>             |
<function2> |                   |                       |                   |                       |
Total       |   <total>         |                       |                   |   <total>             |

A chart can be made with the Total row for each design flaw. This can be vertical bar chart.
*/