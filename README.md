# Solidity Code Parser

A simple single page web application aim to test for four believed-to-be common design flaws in Solidity contracts. Built with Vue (browser style), Node.js Express, Bootstrap and utilizing the Truffle framework. 

Part of a study in a Masters By Research course in Swinburne Sarawak.

### Prerequisites

This web app requires the [Truffle development environment](https://www.trufflesuite.com/docs/truffle/overview) to facilitate directories and compilation of Solidity files (.sol) to JSON build files used for testing. Truffle can be installed via the command: `npm install -g truffle`

### Setup

1. Simply clone this repository and run `npm install` at the root directory to install packages. 
2. Finally run `npm start` at the root directory where a Node Express instance will run at `localhost:8081`

The code parser browser interface sits on top of a Truffle project, where users can perform *two primary features* that being:
1. Performing tests (individually or as a batch) on Solidity contract's design structure (from Truffle's compiled JSON build file).
2. Uploading to and compiling contracts in the Truffle contracts folder.

## Introduction

This project coincides with a research project that aims to empirically review and analyse Solidity security vulnerabilities, but from a broader "common design flaws" perspective. 

Solidity contracts can have a variety of security vulnerabilities ranging from such as *re-entrancy, exception disorders, block state dependencies, and Denial of Service (DoS) problems*. These can be attributed on the misunderstandings of design principles within smart contract development (at least in Solidity's case), ranging from not securing Solidity interactions such as `call() or send()` from re-invocation, mishandling any errors from them, or over trusting external libraries and contracts for important jobs which takes away the developer's control sphere. While important to recognize, it can be daunting to examine each vulnerability's causes and effect, let alone different case studies. 

Hence, the main goal of this project is to contribute a different perspective based on security design principles or patterns. By examining the main root causes of these vulnerabilities from the source code design, They can be understood differently by seeing the neglected security patterns or principles which lead to their manifestation. Additionally, some vulnerabilities can be grouped to come from similar design pitfalls which developers can forget or be unaware when creating their contracts. 

In other words, by reading a contract's design structure, it could be more effective for others to see if certain security principles or patterns are followed. Much like other paradigms, smart contract programming should be no different in having its own set of good design principles, especially given the highly valuable yet highly targetable nature of Ether-holding contracts.


### Testing for design flaws

