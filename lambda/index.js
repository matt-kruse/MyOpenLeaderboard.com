var AWS = require('aws-sdk');
// Set the region
AWS.config.update({region: 'us-east-1'});
// Create the DynamoDB service object
var ddb = new AWS.DynamoDB();

const https = require('https');

var db_get_affiliate = function(id,year) {
  return new Promise((resolve,reject)=>{
    var params = {
      TableName: 'affiliates'+year,
      Key: { 'id' : {N: id+''} }
    };
    ddb.getItem(params, function(err, data) {
      if (err) {
        reject(err);
      } else {
        try {
          if (!data || !data.Item || !data.Item.data) {
            resolve(null);
          }
          else {
            resolve( JSON.parse(data.Item.data.S) );
          }
        }
        catch(e) {
          resolve(null);
        }
      }
    });
  });
};
var db_save_affiliate = function(id, data, year) {
  return new Promise((resolve,reject)=> {
    var params = {
      TableName: 'affiliates'+year,
      Item: {
        'id' : {N: id},
        'data' : {S: JSON.stringify(data)},
      }
    };
    ddb.putItem(params, function(err, data) {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
};
var db_get_athlete = function(id,year) {
  return new Promise((resolve,reject)=>{
    var params = {
      TableName: 'athletes'+year,
      Key: { 'id' : {N: id+''} }
    };
    ddb.getItem(params, function(err, data) {
      if (err) {
        reject(err);
      } else {
        try {
          if (!data || !data.Item || !data.Item.data) {
            resolve(null);
          }
          else {
            resolve( JSON.parse(data.Item.data.S) );
          }
        }
        catch(e) {
          resolve(null);
        }
      }
    });
  });
};
var db_save_athlete = function(id, data, year) {
  return new Promise((resolve,reject)=> {
    var params = {
      TableName: 'athletes'+year,
      Item: {
        'id' : {N: id},
        'data' : {S: JSON.stringify(data)},
      }
    };
    ddb.putItem(params, function(err, data) {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
};

function request(url) {
  return new Promise(function(resolve, reject) {
    https.get(url,
      function(res) {
        var body = '';
        res.on('data', function(chunk) {
          body += chunk;
        });
        res.on('end', function() {
          try {
            var data = JSON.parse(body);
            resolve(data);
          }
          catch (e) {
            resolve(e);
          }
        });
      }
    ).on('error', (e) => {
      resolve(e);
    });
  });
}

function load_data(url,athletes) {
  athletes = athletes || [];
  return new Promise((resolve,reject)=>{
//console.log("url",url);
    request( url ).then((data)=>{
      if (data && data.leaderboardRows && data.leaderboardRows.length>0) {
        athletes = athletes.concat( data.leaderboardRows ) ;
      }
      if (data && data.pagination && data.pagination.totalPages && data.pagination.currentPage<data.pagination.totalPages && data.pagination.totalPages<15) {
        url = url.replace(/page=\d+/,"page="+(data.pagination.currentPage+1));
        resolve( load_data(url,athletes) );
      }
      else {
//                console.log("athletes",athletes.length);
        resolve( athletes );
      }
    });
  });
}

function is_cache_expired(data,key,expire) {
  expire = expire || 3600; // one hour
  if (!data || !data[key]) { return true; }
  var now = Date.now();
  var age = (now-data[key])/1000;
  if (age < expire) {
    // cache is valid!
    data.cached = true;
    data.cache_age = age;
    return false;
  }
  return true;
};

var affiliate_cache = {}; // An in-memory cache for even faster results, BY YEAR!
var lambda_init_time = null;

function load_affiliate(id,year,cache) {
  if (typeof affiliate_cache[year]=="undefined") {
    affiliate_cache[year]={};
  }
  // First check in-memory cache for fastest results
  if (cache && !is_cache_expired(affiliate_cache[year][id],"athletes_loaded_on")) {
    var data = affiliate_cache[year][id];
    data.cache_source = "memory";
    return data;
  }
  // Check to see if it's cached in the db
  return db_get_affiliate(id,year).then((data)=> {
    var divisionIds = [];
    if (cache && !is_cache_expired(data,"athletes_loaded_on")) {
      data.cache_source = "db";
      affiliate_cache[year][id] = data;
      return data;
    }
    /*
    if (data && data.athletes) {
        data.athletes.forEach((a)=>{
            var id = a.entrant.divisionId;
            if (id && divisionIds.indexOf(id)==-1) {
                divisionIds.push(id);
            }
        });
    }
    */
    data = {
      id:id
    };
    // If we got here, then we need to load the data!
    var dataurl = 'https://games.crossfit.com/competitions/api/v1/competitions/open/'+year+'/leaderboards?affiliate=' + id;
    var promises = [];
    if (divisionIds.length>0) {
      divisionIds.forEach((id)=>{
        promises.push(load_data( dataurl + "&division="+id+"&scaled=0&page=1" ) );
        promises.push(load_data( dataurl + "&division="+id+"&scaled=1&page=1" ) );
      });
    }
    else {
      promises.push(load_data( dataurl + "&division=1&scaled=0&page=1" ) );
      promises.push(load_data( dataurl + "&division=1&scaled=1&page=1" ) );
      promises.push(load_data( dataurl + "&division=2&scaled=0&page=1" ) );
      promises.push(load_data( dataurl + "&division=2&scaled=1&page=1" ) );
      promises.push(load_data( dataurl + "&division=7&scaled=0&page=1" ) );
      promises.push(load_data( dataurl + "&division=7&scaled=1&page=1" ) );
      promises.push(load_data( dataurl + "&division=8&scaled=0&page=1" ) );
      promises.push(load_data( dataurl + "&division=8&scaled=1&page=1" ) );
      promises.push(load_data( dataurl + "&division=9&scaled=0&page=1" ) );
      promises.push(load_data( dataurl + "&division=9&scaled=1&page=1" ) );
      promises.push(load_data( dataurl + "&division=10&scaled=0&page=1" ) );
      promises.push(load_data( dataurl + "&division=10&scaled=1&page=1" ) );
      promises.push(load_data( dataurl + "&division=14&scaled=0&page=1" ) );
      promises.push(load_data( dataurl + "&division=15&scaled=0&page=1" ) );
      promises.push(load_data( dataurl + "&division=16&scaled=0&page=1" ) );
      promises.push(load_data( dataurl + "&division=17&scaled=0&page=1" ) );
    }
    // Resolve when all requests resolve
    return Promise.all(promises).then((responses)=>{
      // responses is an array of request responses, containing data
      var athletes = [];
      // Combine them all together
      responses.forEach((r)=> {
        if (r && r.length) {
          athletes = athletes.concat(r);
        }
      });
      // Filter out dupes
      var uniques={};
      athletes = athletes.filter(function(a) {
        var id = a.entrant.competitorId;
        if (uniques[id]) { return false; }
        uniques[id] = true;
        return true;
      });
//console.log("athlete count",athletes.length);
      data.type="affiliate";
      data.athletes = athletes;
      data.athletes_loaded_on = Date.now();
      // Store it in in-memory cache
      affiliate_cache[year][id] = data;
      // Persist to db, then return
//console.log("persisting to db");
      return db_save_affiliate(id,data,year).then(()=>{
//console.log("done");
        return data;
      })
    });
  });
}

var athlete_cache = {}; // An in-memory cache for even faster results
function load_athlete(id,year,cache) {
  if (typeof athlete_cache[year]=="undefined") {
    athlete_cache[year]={};
  }
  // First check in-memory cache for fastest results
  if (cache && !is_cache_expired(athlete_cache[year][id],"athlete_loaded_on")) {
    var data = athlete_cache[year][id];
    data.cache_source = "memory";
    return data;
  }
  // Check to see if it's cached in the db
  return db_get_athlete(id,year).then((data)=> {
    var divisionId = null;
    if (data && data.athlete && data.athlete.entrant && data.athlete.entrant.divisionId) {
      divisionId = data.athlete.entrant.divisionId;
    }
    if (cache && !is_cache_expired(data,"athlete_loaded_on")) {
      data.cache_source = "db";
      athlete_cache[year][id] = data;
      return data;
    }
    else {
      data = {
        id:id
      };
    }
    // If we got here, then we need to load the data!
    var dataurl = 'https://games.crossfit.com/competitions/api/v1/competitions/open/'+year+'/leaderboards?athlete=' + id;
    var urls = [];
    var i=0;
    if (divisionId) {
      urls.push( dataurl + "&division=" + divisionId + "&scaled=0&page=1" );
    }
    else {
      urls.push( dataurl + "&division=1&scaled=0&page=1" );
      urls.push( dataurl + "&division=2&scaled=0&page=1" );
      urls.push( dataurl + "&division=1&scaled=0&page=1" );
      urls.push( dataurl + "&division=2&scaled=0&page=1" );
      urls.push( dataurl + "&division=7&scaled=0&page=1" );
      urls.push( dataurl + "&division=8&scaled=0&page=1" );
      urls.push( dataurl + "&division=9&scaled=0&page=1" );
      urls.push( dataurl + "&division=10&scaled=0&page=1" );
      urls.push( dataurl + "&division=14&scaled=0&page=1" );
      urls.push( dataurl + "&division=15&scaled=0&page=1" );
      urls.push( dataurl + "&division=16&scaled=0&page=1" );
      urls.push( dataurl + "&division=17&scaled=0&page=1" );
    }
    var load = function() {
//console.log("load",i);
      if (i>urls.length-1) { return null; }
//console.log(urls[i]);
      return load_data( urls[i] ).then(function(athletes) {
        i++;
        if (athletes==null) { return athletes; }

        // pick them out of the list
        athletes = athletes.filter(function(a) {
          return a.entrant.competitorId == id;
        });
        var athlete = athletes[0];
        if (!athlete) {
//console.log("athlete not found");
          return load();
        }
        data.type="athlete";
        data.athlete = athlete;
        data.athlete_loaded_on = Date.now();
        // Store it in in-memory cache
        athlete_cache[year][id] = data;
        // Persist to db, then return
//console.log("persisting");
        return db_save_athlete(id,data,year).then(()=>{
//console.log(data);
          return data;
        })
      });
    };
    return load();
  });
}

exports.handler = (event, context, callback) => {
  var send = function(body) {
    callback(null,
      {
        "isBase64Encoded": false,
        "statusCode": 200,
        "headers": {
          'Access-Control-Allow-Origin':'*'
        },
        "body": JSON.stringify(body)
      }
    );
  };

  if (lambda_init_time==null) {
    console.log("Cold start of Lambda!");
    lambda_init_time=(new Date()).toString();
  }
  console.log("Lambda init: "+lambda_init_time);

  var affiliates=[];
  var athletes=[];
  var qs = event.queryStringParameters;
  var year = 2020;
  var cache = true;
  var k;
  if (qs && qs.year) {
    year = qs.year;
  }
  if (qs && "false"==qs.cache) {
    cache = false;
  }
  if (qs && qs.affiliates) {
    if (qs.affiliates=="memory") {
      var aa = affiliate_cache[year];

      if (aa) {
        for (k in aa) {
          affiliates.push(k);
        }
      }
    }
    else {
      affiliates = qs.affiliates.split(/\s*,\s*/);
    }
    console.log("Affiliates in memory: "+affiliates.length);
  }
  if (qs && qs.athletes) {
    athletes = qs.athletes.split(/\s*,\s*/);
  }
  // If nothing to process, return empty
  if (affiliates.length==0 && athletes.length==0) {
    return send({"error":"No affiliates or athletes"});
  }

  var load_promises = [];
  athletes.forEach(function(a) {
    if (/^\d+$/.test(a)) {
      load_promises.push( load_athlete(a,year,cache) );
    }
  });
  affiliates.forEach(function(affiliate) {
    if (/^\d+$/.test(affiliate)) {
      load_promises.push( load_affiliate(affiliate,year,cache) );
    }
  });

  return Promise.all(load_promises).then(function(a) {
    var response = { "affiliates":{}, "athletes":{} };
    a.forEach(function(o) {
      if (o==null) { return; }
      var type = o.type || "affiliate";
      if ("affiliate"==type) {
        if (o && o.athletes) {
          o.athletes.forEach((a)=>{
            if (a && a.scores) {
              a.scores.forEach((s)=>{
                delete s.scoreIdentifier;
                delete s.mobileScoreDisplay;
                delete s.video;
                delete s.breakdown;
                delete s.judge;
                delete s.affiliate;
                delete s.heat;
                delete s.lane;
                delete s.ordinal;
              });
            }
          });
        }
        response.affiliates[o.id] = o;
      }
      else if ("athlete"==type) {
        response.athletes[o.id] = o;
      }
    });
    send( response );
  }).catch(function(e) {
//        console.log(e);
    send({"error":e.toString()});
  });
};
