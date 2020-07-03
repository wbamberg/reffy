const { crawlList } = require("../src/cli/crawl-specs");
const nock = require('nock');
const fs = require("fs");

// TODO: fix crawl-specs to not have to do this
const specs = require('browser-specs');

const mockSpecs = {
  "/woff/woff2/": `<title>WOFF2</title><body><dfn id='foo'>Foo</dfn><a href="https://www.w3.org/TR/bar/#baz">bar</a>`,
  "/mediacapture-output/": `<script>respecConfig = {};</script><script src='https://www.w3.org/Tools/respec/respec-w3c'></script><div id=abstract></div><pre class='idl'>[Exposed=Window] interface Foo { attribute DOMString bar; };</pre>`,
  "/accelerometer/": `<html><h2>Normative references</h2><dl><dt>FOO</dt><dd><a href='https://www.w3.org/TR/Foo'>Foo</a></dd></dl>`
};

nock.disableNetConnect();
// for chrome devtool protocol
nock.enableNetConnect('127.0.0.1');

Object.keys(mockSpecs).forEach(path => {
  nock("https://w3c.github.io")
    .get(path)
    .reply(200, mockSpecs[path], {'Content-Type': 'text/html'});
});


// Handling requests generated by ReSpec document
nock("https://respec.org")
  .persist()
  .options("/xref/").reply(204, '', {"Access-Control-Allow-Methods": "POST,GET",
                                     "Access-Control-Allow-Origin": "*"}).
  post("/xref/").reply(200, {"result":[["cc15613180c92a877452c092012792b9572ad189",[{"shortname":"webidl","spec":"webidl","type":"extended-attribute","normative":true,"uri":"#Exposed"}]],["a28dcf4738f5492eb05f1fd8a27b8ce0ae124d21",[{"shortname":"webidl","spec":"webidl","type":"interface","normative":true,"uri":"#idl-DOMString"}]],["2eb09984ad7f314b43fefeb75a6feedb049ad595",[]]]});

nock("https://specref.herokuapp.com")
  .persist()
  .get("/bibrefs?refs=webidl,__SPEC__HTML").reply(200, {webidl:{href:"https://heycam.github.io/webidl/"}}, {"Access-Control-Allow-Origin": "*"});

nock("https://www.w3.org")
  .persist()
  .get("/scripts/TR/2016/fixup.js").reply(200, '')
  .get("/StyleSheets/TR/2016/logos/W3C").reply(200, '')
  .get("/StyleSheets/TR/2016/base.css").reply(200, '')
  .get("/Tools/respec/respec-highlight.js").replyWithFile(200, __dirname + "/../node_modules/respec-hljs/dist/respec-highlight.js", {"Content-Type": "application/js"})
  .get("/Tools/respec/respec-w3c").replyWithFile(200, __dirname + "/../node_modules/respec/builds/respec-w3c.js", {"Content-Type": "application/js"});


nock.emitter.on('error', function(err) {
  throw(err);
});
nock.emitter.on('no match', function(req, options, requestBody) {
  // 127.0.0.1 is used by the devtool protocol, we ignore it
  if (req && req.hostname !== '127.0.0.1') {
    const error = new Error("No match for nock request on " + (options ? options.href : req.href));
    throw(error);
  }
});

async function crawl() {
  const results = await crawlList(
    [
      // a hand-generated document
      "https://www.w3.org/TR/WOFF2/",
      // a respec document
      "https://www.w3.org/TR/audio-output/",
      // a bikeshed document
      "https://www.w3.org/TR/accelerometer/"
    ]
    // This should be done in crawl-specs directly
      .map(url => specs.find(s => s.url === url)).filter(x => !!x)
  ) ;
  // to avoid reporting bogus diff on updated date
  results.forEach(s => delete s.date);
  return results;
}

if (global.describe && describe instanceof Function) {
  const { assert } = require('chai');

  describe("Test the crawl doesn't completely fail on a small sample of specs", function() {
    this.timeout(10000);
    it("doesn't report 3 errors on crawling 3 specs", async() => {
      const refResults = JSON.parse(fs.readFileSync(__dirname + "/crawl-test.json", "utf-8"));
      const results = await crawl();
      assert.deepEqual(refResults, results);
    });
  });
} else if (require.main === module) {
  // when called directly, we update the fixture file used for comparison
  (async function () {
    const results = await crawl();
    fs.writeFileSync(__dirname + "/crawl-test.json", JSON.stringify(results, null, 2), "utf-8");
  })().catch(err => {
    console.error(err);
    process.exit(2);
  });
}
