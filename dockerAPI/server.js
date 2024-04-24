const express = require("express");
const app = express();
const port = process.env.PORT || 3002;
const mongoose = require("mongoose");
const db = mongoose.connection;
const dotenv = require("dotenv");
dotenv.config();
const bodyparser = require("body-parser");
const apiRouter = require("./routes/apiRoutes.js");

mongoose.connect(process.env.MONGODB_CONNSTRING, {
  authSource: "admin",
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

db.once("open", async function () {
  console.log("Database Connected successfully");
});

// Body-parser middleware
app.use(bodyparser.urlencoded({ extended: false }));
app.use(bodyparser.json());

// Add headers before the routes are defined
app.use(function (req, res, next) {
  console.log("ici")
  // Website you wish to allow to connect
  res.setHeader("Access-Control-Allow-Origin", process.env.BACKEND_URI);

  // Request methods you wish to allow
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  // Request headers you wish to allow
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Set-Cookie,X-Requested-With,content-type"
  );

  // Set to true if you need the website to include cookies in the requests sent
  // to the API (e.g. in case you use sessions)
  res.setHeader("Access-Control-Allow-Credentials", true);
  console.log("end")

  // Pass to next layer of middleware
  next();
});

function apiKeyCheck(req, res, next) {
  console.log(req.get("X-API-KEY"))
  if (req.get("X-API-KEY") == process.env.SECRET_TOKEN) {
    next();
    // print url and body
    console.log(req.url)
    console.log("API Key is correct");
    console.log(req.body)
  } else {
    res.send({ state: "Unauthorized!" });
  }
}

// console.log("ici")
app.use("/api", apiRouter);
app.use(apiKeyCheck);

process.on("uncaughtException", function (err) {
  console.log("Uncaught exception: " + err.stack);
  console.log("NODE NOT EXITING");
});

app.listen(port, () => {
  console.log(`dockerAPI listening on port ${port}`);
});
