/*jshint esversion: 9*/
/* eslint-env es6 */
/*
  Fields of this app:
  fileinput = Solidity file to be uploaded/compiled via submitSolFile().
  errors = Any errors that come from the server.js requests.
  consoleOutput = Used to display messages on the view (such as error messages, outputs from compilation, etc).
  loading = Used to disable the forms when performing actions such as testing/compiling (also for the spinner bootstrap icon display).
  contractNames = Populated with compiled contract names when this app is mounted, or after upload.
  selectedContract = The selected compiled contract name from the select input. Used in selectAndTest() later  
  testResults = The CodeParser.js returned result after selectAndTest(). Refer to CodeParser.js for the expected structure of the test results.
  testAllResults = The return results after testing all compiled contracts after running testAllContracts().
  resultView: Table or Graph for individual test, Overall or ByContract for Test All. This just hides and shows two different views on the results when switching tabs.
  status = Used to display the corresponding spinner bootstrap icon of each action. E.g. if the user compiles, the status will be "compileAll" to display the spinner for the "Compile All" button.
  contractToView = Filled when use opens a specific contract's details in the Test All's ByContract view.
*/
var app = new Vue({ 
  el: '#app',
  data: function() { 
    return { 
      fileinput: '', errors: '', consoleOutput: 'Ready', loading: true, 
      contractNames: [], selectedContract: '', testResults: {}, testAllResults: {}, 
      resultView: '', status: '', contractToView: {}, showPositives: false, showPositiveContracts: false,
      currentList: 1, currentTable: 1, perPage: 10, progress: 0 //for paginations
    };
  },
  computed: {
    isUploadDisabled() {
      return this.fileinput.length == 0 || !this.fileinput.name.match(/\.sol$/);
    },
    isLoading() {
      return this.loading;
    },
    isIndividualTest() {
      return Object.keys( this.testResults ).length != 0;
    },
    isTestAll() {
      return Object.keys( this.testAllResults ).length != 0;
    }
  },
  //Once the view loads, get the name list of compiled contracts from build/contracts
  mounted() {
    let object = this;
    axios.get('/get_contracts').then(function(response){
      object.contractNames = response.data;
      object.loading = false;
    }).catch(function(error){
      console.log("Error:", error);
    });
  },
  methods: {
    resetFields() {
      this.loading = false;
      this.status = '';
      this.testResults = {};
      this.testAllResults = {};
      this.showPositives = false;      
    },
    //same as in mounted as it may be called later after file_upload
    getCompiledContractNames() {
      let object = this;
      axios.get('/get_contracts').then(function(response){
        object.contractNames = response.data;
      }).catch(function(error){
        console.log("Error:", error);
      });
    },

    //For the input file upload in the view. Check if it's .sol format
    handleFileUpload() {
      //get the "solFileInput" reference as state on the ref attribute inside the input file tag
      this.fileinput = this.$refs.solFileInput.files[0];
      if (!this.fileinput.name.match(/\.sol$/)) {
        this.consoleOutput = "Please upload a Solidity file (.sol).";
      } else {
        this.consoleOutput = "";
      }
    },
    
    //Submit the file to be compiled via Truffle on the server side (server.js).
    //Expect the response to be the Truffle stdout detailing compilation
    async submitSolFile() {
      console.log("Uploading and compiling...");
      this.loading = true;
      this.status = 'uploadFile';
      this.consoleOutput = "Uploading and compiling...";
      this.getCompiledContractNames(); //so the new upload file compiled will appear on the list
      let formData = new FormData();
      let object = this;
      formData.append("solFileInput", this.fileinput);
      await axios.post('/file_upload', formData, {
        headers: {
            'Content-Type': 'multipart/form-data'
        }
      }).then(function(response){
        object.consoleOutput = response.data.message;
        object.resetFields();
      }).catch(function(error){
        object.errors = error.response.data.message;
        object.loading = false;
        object.status = '';
      });
    },

    //if the user wants to compile the contracts in the /contract/ folder
    async compile() {
      console.log("Compiling all contracts...");
      this.consoleOutput = "Compiling all contracts...";
      this.status = 'compileAll';
      this.loading = true;
      let object = this;
      await axios.get('/compile_contracts').then(function(response){
        object.getCompiledContractNames();
        object.consoleOutput = response.data.message;
        object.resetFields();
      }).catch(function(error){
        console.log("Error:", error);
        object.errors = error.response.data;
        object.loading = false;
        object.status = '';
      });
    },

    //for the user to test the compiled contracts (from the select list)
    async selectAndTest() {
      console.log("Attempting testing on", this.selectedContract);
      this.loading = true;
      this.status = 'selectTest';
      let object = this;
      let data = {contractName: this.selectedContract};
      await axios.post('/select_test', data, {
        headers: {
            'Content-Type': 'application/json'
        }
      }).then(function(response){
        object.consoleOutput = response.data.message;
        object.resetFields();
        object.testResults = response.data.contract; delete response.data;
        object.resultView = "Table";
      }).catch(function(error){
        object.errors = error.response.data.message;
        object.loading = false;
        object.status = '';
      });
    },
    
    //For the user to test all compiled contracts once confirmed from the popup modal
    testAllContracts() {
      console.log("Attempting testing on all contracts");
      this.loading = true;
      this.status = 'testAllContracts';
      this.progress = 0;
      let object = this;
      let data = {contractsToTest: this.contractNames};

      //Using sse.js, we POST the list of names to test and get progress streams from the server side
      var es = new SSE('/test_all_contracts', {
        headers: { 'Content-Type': 'application/json' },
        payload: JSON.stringify(data)
      });
      //This event will update the frontend for updates on what's being tested
      es.addEventListener('status', message => {
        console.log(message.data);
        object.progress++;
      });
      //Final event where an array of test results is given.
      es.addEventListener('gotTestResults', message => {
        object.testResults = {};
        object.testAllResults = {};
        object.showPositives = false;
        object.testAllResults = JSON.parse(message.data); delete message.data;
        object.resultView = "Overall";
        console.log('Got all test results!');
        object.consoleOutput = "Finished batch test: "+object.testAllResults.contracts.length+" compiled contracts tested.";
      });      
      //Ensure to close the connection to the server once the server ends the stream (even if SSE.js doesn't seem to retry connections like EventSource).
      //Also reset loading flags/status
      es.onreadystatechange = function() { 
        if(es.readyState == es.CLOSED) {
          object.loading = false;
          object.status = '';
          $('#testAllConfirmModal').modal('hide'); //close the modal
          es.close();
        }
      };
      //Catch any errors
      es.onerror = function(e) {
        console.log("Error:", e);
        object.loading = false;
        object.status = '';
        es.close();
      };
      es.stream();
    },

    //Filters for either all functions of a tested contract, or only positive results
    filteredFunctions(functions) {
      if(this.showPositives) {
        return  functions.filter(func => {
          if(func.unsecuredCalls.score > 0 || func.mishandledErrors.score > 0 || func.overDependency.score > 0) {
            return func;
          }
        });
      } else {
        return functions;
      }
    },

    //Assign bootstrap contextual classes to table cells in the table result view
    colorBasedonTest(score, limit) {
      let result = [];
      if(score === 0) {
        result.push('table-success');
      } /* else if (score > 0 && score < limit) {
        result.push('table-warning');
      } */ else if(score > 0) {
        result.push('table-danger');
      }
      return result;
    },

    colorLiquidity(noOpcode, payable) {
      
      let result = [];
      if(!noOpcode || !payable) {
        result.push('table-success');
      } /* else if (score > 0 && score < limit) {
        result.push('table-warning');
      } */ else if(noOpcode && payable) {
        result.push('table-danger');
      }
      return result;
    },

    //For the popovers in the table result view (individual contract test). Also wrap the messages into contextual badges based on its type property
    getMessages(messages) {
      let formattedMsgs = "";
      for(i=0;i<messages.length;i++){
        formattedMsgs += (messages[i].type === "error") ? '<span class="badge badge-danger">' + messages[i].msg + '</span>' :  
        (messages[i].type === "warning") ? '<span class="badge badge-warning">' + messages[i].msg + '</span>' : 
        '<span class="badge badge-success">' + messages[i].msg + '</span>';
      }
      let result = {
        title: "Additional info",
        msgs: formattedMsgs
      };

      return result;
    },

    rowsNames(arrays) {
      return arrays.length;
    },

    rows(arrays) {
      if(this.showPositiveContracts) {
        return arrays.filter(contract => {
          if(contract.positives.unsecuredCalls > 0 || 
            contract.positives.mishandledErrors > 0 || 
            contract.positives.overDependency > 0 || 
            contract.dangerousDelegates.score > 0) {
            return contract;
          }
        }).length;
      } else {
        return arrays.length;
      }
    },

    getTotals(contracts, positive) {
      let positiveCount = contracts.filter(contract => {
        if(contract.positives.unsecuredCalls > 0 || 
          contract.positives.mishandledErrors > 0 || 
          contract.positives.overDependency > 0 || 
          contract.dangerousDelegates.score > 0) {
          return contract;
        }
      }).length;
      
      if(positive) {
        return positiveCount;
      } else {
        return contracts.length - positiveCount;
      }      
    },

    paginate(arrays, currentPage, perPage) { 
      return arrays.slice(
        (currentPage - 1) * perPage,
        currentPage * perPage,
      );
    },

    paginateContracts(arrays, currentPage, perPage) { 
      if(this.showPositiveContracts) {
        return arrays.filter(contract => {
          if(contract.positives.unsecuredCalls > 0 || 
            contract.positives.mishandledErrors > 0 || 
            contract.positives.overDependency > 0 || 
            contract.dangerousDelegates.score > 0) {
            return contract;
          }
        }).slice(
          (currentPage - 1) * perPage,
          currentPage * perPage,
        );
      } else {
        return arrays.slice(
          (currentPage - 1) * perPage,
          currentPage * perPage,
        );
      }
    },
    
    //used for the test all confirmation modal list
    startAt(currentPage, perPage) {
      return ((currentPage - 1) * perPage) + 1;
    },
  }
});

//for the bootstrap popovers on the table view
Vue.directive('popover', function(el, binding){
  let popoverArg = {};
  popoverArg = {
    title: binding.value.title,
    content: binding.value.msgs,
    placement: binding.arg,
    trigger: 'click',
    html: true            
  };

  $(el).popover('dispose'); //destory any previously created popover so that content changes can be shown (otherwise it will retain any previous popover)
  $(el).popover(popoverArg);

});
