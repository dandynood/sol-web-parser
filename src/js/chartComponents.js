/*jshint esversion: 9*/
/* eslint-env es6 */
//vue-chartjs implementation for selectAndTest() graph view
Vue.component('testresult-chart', {
    extends: VueChartJs.Bar,
    props: ['results'],
    data: function () {
        return {
            UCCount: this.results.positives.unsecuredCalls,
            MECount: this.results.positives.mishandledErrors,
            ODCount: this.results.positives.overDependency,
            DDCount: this.results.dangerousDelegates.score,
            DDLimit: this.results.dangerousDelegates.scoreLimit,
            functionCount: this.results.functions.length,
        };
    },
    mounted() {
        this.renderChart({
            labels: ['Unsecured Calls', 'Mishandled Errors', 'Over-dependency', 'Dangerous Delegate'],
            datasets: [{
                backgroundColor: '#f5c6cb',
                borderColor: '#dc3545',
                borderWidth: '2',
                data: [this.UCCount, this.MECount, this.ODCount, this.DDCount],
                labels: [this.functionCount, this.functionCount, this.functionCount, this.DDLimit]
            }]
        }, {
            responsive: true,
            maintainAspectRatio: false,
            tooltips: {
                enabled: false
            },
            legend: {
                display: false
            },
            layout: {
                padding: {
                    left: 0,
                    right: 0,
                    top: 30,
                    bottom: 0
                }
            },
            scales: {
                yAxes: [{
                    ticks: {
                        beginAtZero: true,
                        stepSize: 1,
                        max: this.functionCount
                    },
                    scaleLabel: {
                        display: true,
                        labelString: 'Functions'
                    }
                }]
            },
            plugins: {
                datalabels: {
                    anchor: 'end',
                    align: 'top',
                    formatter: function (value, context) {
                        return value + " / " + context.dataset.labels[context.dataIndex];
                    },
                    font: {
                        weight: 'bold'
                    }
                }
            }
        });
    }
});

//vue-chartjs implementation for a Test All Contracts graph view
Vue.component('testall-chart', {
    extends: VueChartJs.Bar,
    props: ['results'],
    data: function () {
        return {
            positives: this.results.positives,
            negatives: this.results.negatives,
            numOfContracts: this.results.numOfContracts
        };
    },
    mounted() {
        this.renderChart({
            labels: ['Unsecured Calls', 'Mishandled Errors', 'Over-dependency', 'Dangerous Delegate'],
            datasets: [{
                    backgroundColor: '#f5c6cb',
                    borderColor: '#dc3545',
                    borderWidth: '2',
                    data: [this.positives.unsecuredCalls, this.positives.mishandledErrors, this.positives.overDependency, this.positives.dangerousDelegates],
                    label: "Positives",
                    datalabels: {
                        align: 'start'
                    }
                },
                {
                    backgroundColor: '#c3e6cb',
                    borderColor: '#28a745',
                    borderWidth: '2',
                    data: [this.negatives.unsecuredCalls, this.negatives.mishandledErrors, this.negatives.overDependency, this.negatives.dangerousDelegates],
                    label: "Negatives",
                    datalabels: {
                        align: 'end'
                    }
                }
            ]
        }, {
            responsive: true,
            maintainAspectRatio: false,
            tooltips: {
                enabled: true,
                mode: 'label',
                callbacks: {
                    label: function (item, data) {
                        var dstLabel = data.datasets[item.datasetIndex].label;
                        var yLabel = item.yLabel;
                        return dstLabel + ': ' + yLabel;
                    }
                },
                itemSort: function (a, b) {
                    return b.datasetIndex - a.datasetIndex;
                }
            },
            legend: {
                display: true
            },
            layout: {
                padding: {
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: 0
                }
            },
            scales: {
                xAxes: [{
                    stacked: true,
                    ticks: {
                        stepSize: 1
                    }
                }],
                yAxes: [{
                    stacked: true,
                    ticks: {
                        beginAtZero: true,
                        stepSize: 1,
                        max: this.numOfContracts
                    },
                    scaleLabel: {
                        display: true,
                        labelString: 'Contracts'
                    }
                }]
            },
            plugins: {
                datalabels: {
                    clip : true,
                    font: {
                        weight: 'bold'
                    }
                }
            }
        });
    }
});