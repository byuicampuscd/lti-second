/* eslint-env node*/
/* eslint no-console:0*/

var fs = require("fs"),
    https = require("https"),
    lti = require('ims-lti'),
    qs = require('querystring'),
    chalk = require('chalk'),
    Learnosity = require('learnosity-sdk-nodejs'),
    port = 8080,
    options = {
        key: fs.readFileSync(__dirname + "/keys/server.key"),
        cert: fs.readFileSync(__dirname + "/keys/server.crt")
    },
    htmlFiles = require('./htmlFilesToObject.js')(),
    getReqData = require('./getRequestData.js'),
    creds = JSON.parse(fs.readFileSync("../dev.json", "utf8")),
    provider = new lti.Provider("my_cool_key", "my_cool_secret"),
    url = require('url');

var uuidV4 = require('uuid/v4');
console.log("htmlFiles:", Object.keys(htmlFiles));
/*
    helper function to make a console.log() also write to data.log
*/
function writeLog() {
    var argString = Array.from(arguments).map(function (arg) {
        if (typeof arg === "object") {
            return JSON.stringify(arg, null, 2);
        }
        return arg.toString();
    }).join(' ');
    argString += "\n------------------------------------------\n"

    fs.appendFile("data.log", argString, function () {});
    console.log.apply(null, arguments);
}

function makeErrorHtml(message) {
    return htmlFiles.error
        .replace(/{{message}}/g, message);
}

function makeRequestHtml(html, request) {
    //add in the request JSON
    return html.replace(/{{request}}/, JSON.stringify(request, null, 4));
}

function findRole(provider) {
    if (provider.body.roles.includes('Instructor' || 'Administrator')) {
        return 'Instructor';
    } else {
        return 'Student';
    }
}

function displayHome(request, res) {
    var reader;
    //       var role = findRole(provider);
    console.log(request.url);
    /*    if (role == 'Instructor') {

        } else if (role == 'Student') {
            res.end(htmlFiles.index);
        } else {
            res.end(htmlFiles.error);
        }*/
    request = url.parse(request.url).pathname;
    if (request == "/") {
        reader = fs.createReadStream("./html/index.html");
    } else {
        reader = fs.createReadStream(request);
    }
    reader.pipe(res);
    reader.on("error", function (e) {
        console.log('error:' + e)
        res.end();
    });
}

function sendLearnosityBack(request, response) {
    // Instantiate the SDK
    var requestOut, requestData, item,
        learnositySdk = new Learnosity(),
        security = {
            'consumer_key': creds.key,
            'domain': 'localhost',
            'user_id': 'Ben'
        };
    var url_parts = url.parse(request.url, true);
    item = url_parts.query.item;
    //get the right data
    requestData = getReqData(item,
        uuidV4(),
        htmlFiles,
        security.user_id);

    //make request with correct data
    requestOut = learnositySdk.init(requestData.service, security, creds.secret, requestData.request);

    //make and send the html
    response.end(makeRequestHtml(requestData.html, requestOut));
}

function processRequest(request, response) {
    if (request.method === 'POST') {
        var bodyString = '';

        request.on('data', function (data) {
            bodyString += data;
            if (bodyString.length > 1e6) {
                request.connection.destroy();
            }
        });

        request.on('end', function () {
            var body = qs.parse(bodyString)

            provider.valid_request(request, body, function (err, isValid) {
                writeLog("provider:", provider);

                //check if the lti is valid
                if (err || !isValid) {
                    console.log(chalk.red("Invalid LTI Launch"));
                    response.end(makeErrorHtml("Invalid LTI Launch"));
                    return;
                }
                console.log(chalk.green("Yay! Valid LTI"));
                displayHome(request, response);
            });

        });
    } else if (request.method === 'GET') {
        var reader;
        var requestUrl = url.parse(request.url).pathname;
        if (requestUrl == '/learnosity') {
            sendLearnosityBack(request, response);
        } else {
            if (requestUrl == "/") {
                reader = fs.createReadStream("./html/index.html");
            } else {
                reader = fs.createReadStream("./html" + requestUrl.replace(/%20/g, ' '));
            }
            reader.pipe(response);
            reader.on("error", function (e) {
                console.log(e);
                response.end();
            });
        }
    } else {
        //no post or get
        console.log('default called');
        response.end(htmlFiles.default);

    }
}


https.createServer(options, processRequest).listen(port)
console.log(chalk.blue("Server is active at 8080"));
