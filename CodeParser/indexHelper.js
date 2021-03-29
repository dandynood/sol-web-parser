/*jshint esversion: 9*/
/* eslint-env es6 */
/*  Index Helper V1, Last updated: 29/12/2020
    This is a helper module to attempt to get sequences that either start on, stop on, or in between two indexes.
*/
let dictionary = require("./dictionary.json");
module.exports = {
    result : [],
    test : function(sequence) {
        for(let i = 0; i < sequence.length; i++) {
            console.log(sequence[i]);
            if(sequence[i].subBlock) {
                if(sequence[i].subBlock.length !== 0) {
                    this.test(sequence[i].subBlock);
                }
            }
            //if any ifstatements are found via truebody, unpack
            if(sequence[i].trueBody){
                this.test(sequence[i].trueBody);
            }
        }        
    },

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

    removeStartOn : function(index, seq) {
        let sequence = JSON.parse(JSON.stringify(seq.slice(index[0]))); //at dim = 0, slice till to the starting point
        //if this starting point is some If/Else/Else If, we need to remove any other Else/Else If after since only one body in this control structure can proceed
        if(sequence[0].trueBody) {
            let deleteNum = 0;
            //start ahead
            for(let i=1; i < sequence.length; i++) {
                //if the next statement is a Else/Else If, increment deleteNum for deletion later
                if(sequence[i].nodeType === "ElseIfStatement" || sequence[i].nodeType === "ElseStatement") {
                    deleteNum++;
                //once we find a non Else/Else if, break this loop and proceed to delete
                } else {
                    break;
                }
            }
            //start after on index 1, then delete
            sequence.splice(1,deleteNum);
        }
        //if the index is at a higher dimension, there is a sub-block. Trimming is needed to remove all those from index [block, 0] to [block, n].
        if(index.length > 1) { 
            if(sequence[0].subBlock) {
                sequence[0].subBlock = this.removeStartOn(index.slice(1), sequence[0].subBlock);
            } else if(sequence[0].trueBody){
                sequence[0].trueBody = this.removeStartOn(index.slice(1), sequence[0].trueBody);
            }
        }
        return sequence;
    },

    removeStopOn : function(index, sequence) {
        let coordinate = index[0];
        sequence.splice(coordinate+1); //remove out elements till position index+1
        //if this coordinate is an Else or Else if, we need to trim any previous If/Else Ifs as only one body in this control structure can proceed.
        if(sequence[coordinate].nodeType === "ElseIfStatement" || sequence[coordinate].nodeType === "ElseStatement") {
            //e.g. if [3] has a parentIf at [1], then delete 3 - 1 = 2 elements 
            let deleteNum = coordinate - sequence[coordinate].parentIf;
            let shiftedCoordinates = sequence[coordinate].parentIf; //since splice will shift the positions, keep the parentIf as the Else/Else if will take this position after delete
            sequence.splice(sequence[coordinate].parentIf,deleteNum); //start from the parentIf, delete parentIf + n ElseIfs before the coordinate
            coordinate = shiftedCoordinates; //adjust coordinate after delete
            //sequence[coordinate].indexNum[0] = shiftedCoordinates;
            //index[0] = shiftedCoordinates;
        } 
        if(index.length > 1) { //if the index is at a higher dimension, there is a sub-block. Trimming is needed to remove all those from index [block, 0] to [block, n].
            if(sequence[coordinate].subBlock) {
                this.removeStopOn(index.slice(1), sequence[coordinate].subBlock);
            } else if(sequence[coordinate].trueBody){
                this.removeStopOn(index.slice(1), sequence[coordinate].trueBody);
            } 
        }
    },

    startOn: function(sequence, start) {
        let result = JSON.parse(JSON.stringify(sequence));
        let startIndex = JSON.parse(JSON.stringify(start));
        this.result = this.removeStartOn(startIndex, result);
        //console.log("Start on", start);
        //this.test(this.result);
        return result;
    },

    stopOn: function(sequence, stop) {
        let result = JSON.parse(JSON.stringify(sequence));
        let stopIndex = JSON.parse(JSON.stringify(stop));
        this.removeStopOn(stopIndex, result);
        //console.log("Stop on", stop);
        //this.test(this.result);
        return result;
    },

    saveIndexes : function(sequence, indexList) {
        for(let i = 0; i < sequence.length; i++) {
            indexList.push(sequence[i].indexNum.toString());
            if(sequence[i].subBlock) {
                if(sequence[i].subBlock.length !== 0) {
                    this.saveIndexes(sequence[i].subBlock, indexList);
                }
            }
            //if any ifstatements are found via truebody, unpack
            if(sequence[i].trueBody){
                this.saveIndexes(sequence[i].trueBody, indexList);
            }
        }        
    },

    finalTrim : function(sequence, intersection) {
        let result = [];
        for(let i = 0; i < sequence.length; i++) {
            if(intersection.includes(sequence[i].indexNum.toString())) {
                result.push(sequence[i]);
            }
            if(sequence[i].subBlock) {
                if(sequence[i].subBlock.length !== 0) {
                    sequence[i].subBlock = this.finalTrim(sequence[i].subBlock, intersection);
                }
            }
            //if any ifstatements are found via truebody, unpack
            if(sequence[i].trueBody){
                sequence[i].trueBody = this.finalTrim(sequence[i].trueBody, intersection);
            }
        }
        return result;        
    },

    inBetween: function(sequence, start, stop) {
        let stopSequence = JSON.parse(JSON.stringify(sequence));
        let startIndex = JSON.parse(JSON.stringify(start));
        let stopIndex = JSON.parse(JSON.stringify(stop));
        let stopIndexList = [];
        let startIndexList = [];

        this.removeStopOn(stopIndex, stopSequence);
        this.saveIndexes(stopSequence, stopIndexList);
        let startSequence = this.removeStartOn(startIndex, JSON.parse(JSON.stringify(sequence)));
        this.saveIndexes(startSequence, startIndexList);

        let intersection = stopIndexList.filter(x => {
            return startIndexList.includes(x);
        });

        let result = this.finalTrim(JSON.parse(JSON.stringify(sequence)), intersection);

        //console.log("In Between", start, stop);
        return result;
    }
};