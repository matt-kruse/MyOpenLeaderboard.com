var $ = angular.element;
function download_to_excel(el,table) {
  var $el = $(el);
  var contentType = 'data:application/vnd.ms-excel;base64';
  var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" ><head><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>{sheetname}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body>{table}</body></html>';
  var format = function(s, c) { return s.replace(/{(\w+)}/g, function(m, p) { return c[p]; }) };
  var blobbed = function(data) {
    var blob = new Blob([format(html, data)], { type: contentType });
    var blobURL = window.URL.createObjectURL(blob);
    if (blobURL) {
      el.setAttribute('href', blobURL);
      el.setAttribute('download', data['name']);
    }
  };
  blobbed({
    sheetname: 'OpenData',
    name: 'OpenData.xls',
    table: '<table>'+$(table).html()+'</table>'
  });
}
var app = angular.module("App", ['chart.js']);
app.controller("Controller", function($scope, $http, $interval, $timeout) {
  $scope.sortby = '_rank';
  $scope.sortdesc = false;
  $scope.selected = null;
  $scope.counter = 180;

  $scope.filters = {
    "sex":""
    ,"scaled":""
  };

  $scope.show_teens = true;
  $scope.show_masters = true;
  $scope.show_others = true;

  $interval(function() {
    $scope.counter--;
    if ($scope.counter<1) {
      window.location.reload(true);
    }
  }, 1000*60 );
  $scope.time = function(s) {
    if (typeof s!="number") { return "(invalid)"; }
    var m = Math.floor(s/60);
    s = Math.floor(s-m*60);
    return m+" min "+s+" sec";
  };
  $scope.sort = function(key,desc) {
//		$scope.sortdesc = (key==$scope.sortby) ? !$scope.sortdesc : (typeof desc=="boolean"?desc:false);
    if (key==$scope.sortby) {
      $scope.sortby = "-"+key;
    }
    else {
      $scope.sortby = key;
    }
  };

  $scope.divisions = {
    '2': 'Women',
    '1': 'Men',
    '11': 'Team',
    '15': 'Girls (14-15)',
    '14': 'Boys (14-15)',
    '17': 'Girls (16-17)',
    '16': 'Boy (16-17)',
    '19': 'Women (35-39)',
    '18': 'Men (35-39)',
    '13': 'Women (40-44)',
    '12': 'Men (40-44)',
    '4': 'Women (45-49)',
    '3': 'Men (45-49)',
    '6': 'Women (50-54)',
    '5': 'Men (50-54)',
    '8': 'Women (55-59)',
    '7': 'Men (55-59)',
    '10': 'Women (60+)',
    '9': 'Men (60+)'
  };

  $scope.division_buckets = {
    '2': 'Normal',
    '1': 'Normal',
    '15': 'Teen',
    '14': 'Teen',
    '17': 'Teen',
    '16': 'Teen',
    '19': 'Normal',
    '18': 'Normal',
    '13': 'Normal',
    '12': 'Normal',
    '4': 'Normal',
    '3': 'Normal',
    '6': 'Normal',
    '5': 'Normal',
    '8': 'Masters',
    '7': 'Masters',
    '10': 'Masters',
    '9': 'Masters'
  };

  $scope.ids = null;
  $scope.athletes = null;
  $scope.chart_workout = 0;

  $scope.logo = "logo_192.png";

  var query = null;
  try {
    query = location.search.substring(1);
  } catch(e) { }
  if (query && (/athletes/.test(query) || /affiliates/.test(query))) {
    $scope.ids = query;
    var i=0;
    var a=0;
    var page=1;
    var athletes=[];
    var dataurls = [];

    $scope.process_athletes = function() {
      var filtered_athletes = [];
      if (athletes && athletes.length>0) {
        // Filter out dupes
        var uniques = {};
        filtered_athletes = athletes.filter(function(a) {
          var id = a.entrant.competitorId;
          if (uniques[id]) { return false; }
          uniques[id] = true;
          return true;
        });

        // Apply Division filter
        filtered_athletes = filtered_athletes.filter(function (a) {
          var div = a.entrant.divisionId;
          var bucket = $scope.division_buckets[div];
          if (!$scope.show_teens && !$scope.show_masters && !$scope.show_others) {
            $scope.show_teens = $scope.show_masters = $scope.show_others = true;
            return true;
          }
          if (!bucket) return true;
          if (bucket==="Teen") return $scope.show_teens;
          if (bucket==="Masters") return $scope.show_masters;
          return $scope.show_others;
        });

        // Apply filters
        filtered_athletes = filtered_athletes.filter(function(a) {
          if ($scope.filters.sex!="" && $scope.filters.sex!=a.entrant.gender) { return false; }
          if ($scope.filters.scaled!="") {
            // check all the workouts
            for (var i=0; i<6; i++) {
              try {
                if (typeof a.scores[i].scaled!="undefined" && ($scope.filters.scaled != a.scores[i].scaled)) { return false; }
              } catch(e) { }
            }
          }
          return true;
        });

        // Fix scores
        filtered_athletes.forEach(function(a) {
          a._total_rank = 0;
          a._rank = 0;
          for (var i=0; i<6; i++) {
            a.scores[i] = a.scores[i] || {};
            var s = a.scores[i];
            if (s.score) {
              s.score = +s.score;
            }
            s._workout_rank = null;
            s._overall_rank = null;
            s._overall_score = 0;
          }
        });

        // For each workout, assign the real workout rank
        for (var i=0; i<6; i++) {
          // Sort from highest to lowest
          filtered_athletes = filtered_athletes.sort(function(a,b) {
            var as = +a.scores[i].score || 0;
            var bs = +b.scores[i].score || 0;
            if (!as && !bs) { return 0; }
            if (!bs || (as>bs)) { return -1; }
            if (!as || (as<bs)) { return 1; }
            return 0;
          });

          if (!filtered_athletes[0].scores[i].score) { break; }

          var rank = 0;
          var assigned_rank = 0;
          filtered_athletes.forEach(function(a,index) {
            if (index==0 || a.scores[i].score != filtered_athletes[index-1].scores[i].score) {
              rank++;
              assigned_rank = rank;
            }
            else {
              rank++;
            }
            a.scores[i]._workout_rank = assigned_rank;
            var previous = (i==0) ? 0 : a.scores[i-1]._overall_score;
            a.scores[i]._overall_score = previous + assigned_rank;
            a._total_rank += assigned_rank;
          });

          // Sort by overall score in this workout
          filtered_athletes = filtered_athletes.sort(function(a,b) {
            var as = +a.scores[i]._overall_score || 999;
            var bs = +b.scores[i]._overall_score || 999;
            if (!as && !bs) { return 0; }
            if (!bs || (as>bs)) { return 1; }
            if (!as || (as<bs)) { return -1; }
            return 0;
          });

          // Now assign them overall rank for this workout
          var rank = 0;
          var assigned_rank = 0;
          filtered_athletes.forEach(function(a,index) {
            if (index==0 || a.scores[i]._overall_score != filtered_athletes[index-1].scores[i]._overall_score) {
              rank++;
              assigned_rank = rank;
            }
            else {
              rank++;
            }
            a.scores[i]._overall_rank = assigned_rank;
          });

          // Calculate the change in overall rank
          filtered_athletes.forEach(function(a,index) {
            if (i==0 || a.scores[i-1]._overall_rank==0 || a.scores[i].score==0) {
              // First workout, overall rank = workout rank
              a.scores[i].rankchange = 0;
            }
            else {
              // Look back at previous rank
              a.scores[i].rankchange = a.scores[i-1]._overall_rank - a.scores[i]._overall_rank;
            }
          });

        }

        // Now sort by overall rank by default
        filtered_athletes = filtered_athletes.sort(function(a,b) {
          var ar = +a._total_rank || 0;
          var br = +b._total_rank || 0;
          if (!ar && !br) { return 0; }
          if (ar>br) { return 1; }
          if (ar<br) { return -1; }
          return 0;
        });
        var rank=0;
        var assigned_rank=1;
        filtered_athletes.forEach(function(a,i) {
          if (i==0 || filtered_athletes[i]._total_rank != filtered_athletes[i-1]._total_rank) {
            rank++;
            assigned_rank=rank;
          }
          else {
            rank++;
          }
          a._rank = assigned_rank;
        });
        // Now compute rank %
        filtered_athletes.forEach(function(a,i) {
          a._pct = ((rank-a._rank-1) / (rank-1))*100;
        });

        $scope.athletes = filtered_athletes;

        $scope.update_chart = function(workout_num) {
          if (typeof workout_num!="undefined") {
            $scope.chart_workout = workout_num;
          }
          else {
            workout_num = $scope.chart_workout;
          }

          var tooltips = [ [], [] ];
          function data_label(item,data) {
            return (item.index>tooltips[item.datasetIndex].length-1) ? "unknown" : tooltips[item.datasetIndex][item.index];
          };
          // Update chart data
          $scope.label_index=0;
          $scope.labels = [];
          $scope.series = ['RX','Scaled'];
          $scope.datasetOverride = [{ yAxisID: 'y-axis-1' }, { yAxisID: 'y-axis-2' }];
          $scope.options = {
            maintainAspectRatio:false,
            tooltips: {
              callbacks: {
                label:data_label
              }
            },
            legend: {
              display:true,
              position:'bottom'
            },
            scales: {
              yAxes: [
                {
                  id: 'y-axis-1',
                  type: 'linear',
                  display: false,
                  position: 'left'
                },
                {
                  id: 'y-axis-2',
                  type: 'linear',
                  display: false,
                  position: 'right'
                }
              ]
            }
          };
          var rx_data = [];
          var scaled_data = [];
          var label_max = 0;
          // Sort from highest to lowest
          var chart_data = $scope.athletes.sort(function(a,b) {
            var as = +a.scores[workout_num].score || 0;
            var bs = +b.scores[workout_num].score || 0;
            if (!as && !bs) { return 0; }
            if (!bs || (as>bs)) { return -1; }
            if (!as || (as<bs)) { return 1; }
            return 0;
          });
          chart_data.forEach(function(a) {
            var s = a.scores[workout_num];
            var score;
            if (s && s.score) {
              score = s.score;
              /* Individual Workout adjustments! */
              /*
                            if (workout_num==1 && s.scaled==0 && score<=11100000) {
                                score = 11100000 - (2*(11100000 - score)/10000);
                            }
                            else if (workout_num==1 && s.scaled==1 && score<=1100000) {
                                score = 1100000 - (2*(1100000 - score)/10000);
                            }
                            else if (workout_num==3) {
                                if (s.scaled==0) {
                                    score = Math.floor((score-10000000)/10000);
                                }
                                else {
                                    score = Math.floor(score/10000);
                                }
                            }
              */
              if (s.scaled==1) {
                tooltips[1].push(" "+s.scoreDisplay+" ("+a.entrant.competitorName+")");
                scaled_data.push(score);
              }
              else {
                tooltips[0].push(" "+s.scoreDisplay+" ("+a.entrant.competitorName+")");
                $scope.label_index++;
                $scope.labels.push($scope.label_index);
                rx_data.push(score);
              }
            }
          });

          // Adjust axes per workout
          //$scope.options.scales.yAxes[0].ticks = {"min":0};
          //$scope.options.scales.yAxes[0].ticks= (workout_num==3) ? {"min":0,"max":948} : {};
          //$scope.options.scales.yAxes[1].ticks= (workout_num==3) ? {"min":0,"max":948} : {};

          $scope.data = [rx_data,scaled_data];
        }
        if ($scope.show_chart) {
          $scope.update_chart();
        }
      }
      else {
        $scope.athletes = [];
      }
    };
    $scope.toggle_chart = function() {
      $scope.show_chart = !$scope.show_chart;
      if ($scope.show_chart) {
        $scope.update_chart();
      }
    };

    $scope.affiliate_ids = [];
    $scope.athlete_ids = [];
    $scope.highlight = {};
    $scope.title = null;

    $scope.show_affiliate = true;
    $scope.show_division = false;
    $scope.show_country = false;
    $scope.show_help = false;
    $scope.show_whats_new = false;
    $scope.show_header = true;
    $scope.show_donate = false;
    $scope.show_donate_details = false;
    $scope.show_chart = false;
    $scope.cache = true;

    var now = (new Date()).getTime();
    var is_after = function(y,m,d) {
      var d = new Date(y,m-1,d);
      return (now > d.getTime()) ? 1 : 0;
    };
    $scope.show_20_1 = 1;
    $scope.show_20_2 = 1;
    $scope.show_20_3 = is_after(2019,10,23);
    $scope.show_20_4 = is_after(2019,10,30);
    $scope.show_20_5 = is_after(2019,11,6);
    $scope.reddit = false;

    // If affiliates are passed in the old way
    if (/^[\d,]+$/.test($scope.ids)) {
      $scope.affiliate_ids = $scope.ids.split(/\s*,\s*/);
    }
    else {
      // Parse query stringvar
      var params = $scope.ids.split(/&/);
      params.forEach(function(p) {
        try {
          var kv = p.split(/=/);
          if (kv[0]=="athletes") {
            if ("reddit"==kv[1]) {
              $scope.reddit = true;
            }
            $scope.athlete_ids = kv[1].split(/\s*,\s*/);
          }
          else if (kv[0]=="affiliates") {
            $scope.affiliate_ids = kv[1].split(/\s*,\s*/);
          }
          else if (kv[0]=="highlight") {
            kv[1].split(/\s*,\s*/).forEach(function(i) {
              $scope.highlight[i] = true;
            });
          }
          else if (kv[0]=="sex") {
            $scope.filters.sex=kv[1];
          }
          else if (kv[0]=="scaled") {
            $scope.filters.scaled=kv[1];
          }
          else if (kv[0]=="title") {
            $scope.title=kv[1];
          }
          else {
            if (kv[1]=="0") { kv[1]=0; }
            $scope[kv[0]] = kv[1];
          }
        }
        catch(e) { }
      });
    }
    //console.log("affiliates",$scope.affiliate_ids);
    //console.log("athletes",$scope.athlete_ids);

    $scope.num_affiliates = 0;
    $scope.affiliate_name = null;
    if ($scope.affiliate_ids=="memory") { $scope.num_affiliates=99; }

    // Process each affiliate and add it to the loader
    $scope.user_base_url = "https://games.crossfit.com/athlete/";
    var url = 'https://17f05zpuae.execute-api.us-east-1.amazonaws.com/prod/proxy?affiliates='+$scope.affiliate_ids+"&athletes="+$scope.athlete_ids+"&cache="+$scope.cache; // prod
    if ($scope.reddit) {
      $scope.user_base_url = "http://reddit.com/user/";
      $scope.title = "Reddit";
      $scope.show_affiliate = false;
    }
    //var url = 'https://enqoy6eal3.execute-api.us-east-1.amazonaws.com/prod/proxy?affiliates='+$scope.affiliate_ids+"&athletes="+$scope.athlete_ids; // test
    $http.get(url).then( function(data) {
      /*
      {
          "affiliates": {
              "123": {
                  "id":123,
                  ,"name":"Crossfit Bob"
                  ,"athletes": [ ... ]
                  ,"athletes_loaded_on": 123456789
                  ,"cached": BOOL
                  ,"cache_age": 123
                  ,"cache_source": (memory|db)
              }
          }
      */
      if (!data || !data.data || !data.data.affiliates) {
        return;
      }
      // Combine all affiliate and athlete lists together
      $scope.affiliates = data.data.affiliates;
      $scope.individual_athletes = data.data.athletes;
      athletes = [];
      for (id in $scope.affiliates) {
        $scope.num_affiliates++;
        if (id==11328) { $scope.show_donate=false; }
        athletes = athletes.concat( $scope.affiliates[id].athletes );
      }
      for (id in $scope.individual_athletes) {
        athletes = athletes.concat( $scope.individual_athletes[id].athlete );
      }
      if (!$scope.reddit && $scope.num_affiliates==1) {
        $scope.show_affiliate = false;
        $scope.affiliate_name = athletes[0].entrant.affiliateName;
        if (!$scope.title) {
          $scope.title = $scope.affiliate_name;
        }
      }
      $scope.athletes = athletes;
      $timeout($scope.process_athletes,1);
    }).catch(function(e) {
      athletes = [];
      $timeout($scope.process_athletes,1);
    });
  }

  $scope.aac_list = null;
  $scope.aac_searching = false;
  var aac_timeout = null;
  $scope.aac_update = function(i) {
    var val = document.getElementById('aac').value;
    if (val.length >= 3) {
      aac_timeout && $timeout.cancel(aac_timeout);
      aac_timeout = $timeout($scope.aac, 300);
    }
    else if (val.length===0) {
      $scope.aac_list = null;
    }
  };
  $scope.aac = function() {
    var term = document.getElementById('aac').value;
    $scope.aac_searching = true;
    $scope.aac_list = null;
    $http.get("https://8xd8ar771c.execute-api.us-east-1.amazonaws.com/prod/xray?url=https%3A%2F%2Fgames.crossfit.com%2Fac.php%3Ftype%3Daffiliates%26limit%3D50%26term%3D"+encodeURIComponent(term)).then(function(data) {
      $scope.aac_searching = false;
      try {
        $scope.aac_list = JSON.parse(data.data.content);
      }
      catch(e) {
        $scope.aac_list = null;
      }
    });
  };
  $scope.affiliate_select = function(id) {
    var a = document.getElementById('a');
    var list = a.value;
    if (a.value.length>0) {
      list = a.value.split(/\s*,\s*/);
    }
    else {
      list = [];
    }
    if (list.indexOf(id)===-1) {
      list.push(id);
    }
    a.value = list.join(",");
  };

  $scope.cac_list = null;
  $scope.cac_searching = false;
  var cac_timeout = null;
  $scope.cac_update = function(i) {
    var val = document.getElementById('cac').value;
    if (val.length >= 3) {
      cac_timeout && $timeout.cancel(cac_timeout);
      cac_timeout = $timeout($scope.cac, 300);
    }
  };
  $scope.cac = function() {
    var term = document.getElementById('cac').value;
    $scope.cac_searching = true;
    $scope.cac_list = null;
    $http.get("https://8xd8ar771c.execute-api.us-east-1.amazonaws.com/prod/xray?url=https://games.crossfit.com/competitions/api/v1/competitions/open/2020/athletes%3Fterm="+encodeURIComponent(term)).then(function(data) {
      $scope.cac_searching = false;
      try {
        $scope.cac_list = JSON.parse(data.data.content);
      }
      catch(e) {
        $scope.cac_list = null;
      }
    });
  };
  $scope.athlete_select = function(id) {
    var a = document.getElementById('c');
    var list = a.value;
    if (a.value.length>0) {
      list = a.value.split(/\s*,\s*/);
    }
    else {
      list = [];
    }
    if (list.indexOf(id)===-1) {
      list.push(id);
    }
    a.value = list.join(",");
  };
  
  $scope.apply_filter = function(filter,val) {
    if (filter) {
      $scope.filters[filter] = val;
    }
    $timeout($scope.process_athletes,10);
  };
  $scope.apply_toggle = function(val) {
    $scope[val] = !$scope[val];
    $timeout($scope.process_athletes,10);
  };

});