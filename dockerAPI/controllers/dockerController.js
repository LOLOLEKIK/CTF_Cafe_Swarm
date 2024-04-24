const compose = require("docker-compose");
const dockers = require("../models/dockerModel");
const path = require("path");
const cron = require("node-cron");
const fs = require("fs");
const simpleGit = require("simple-git");
const crypto = require("crypto");
const { fromUrl } = require("hosted-git-info");
require("dotenv").config();
const util = require('util');
const exec = require('child_process').exec;

const execAsync = util.promisify(exec);

const progress = new Map();

// Cron Job to check if docker containers should be stopped after 2 hours
cron.schedule("* * * * *", () => {
  dockers
    .find({ deployTime: { $lt: new Date(Date.now() - 2 * 60 * 60 * 1000) } })
    .then(async (allDockers) => {
      allDockers.forEach(async (docker) => {
        if (Date.now() - docker.deployTime >= 1000 * 60 * 60 * 2) {
          if (process.env.INSWARM == "true") {
            await stopAndRemoveStack(docker.dockerId);
          } else {
          // stop docker
          await compose.stop({
            cwd: docker.path,
            composeOptions: [["-p", docker.dockerId]],
          });
          await compose.rm({
            cwd: docker.path,
            composeOptions: [["-p", docker.dockerId]],
          });
        }
          await dockers.findByIdAndDelete(docker._id);
        }
      });
    });
});

async function getInfosfromUrl(url) {
  let infos = await fromUrl(url);
  if (!infos.treepath) throw new Error("Invalid project path");
  if (!infos.committish) throw new Error("Invalid project path");
  // Get the challenge path, from Github Url. ex: prog/nop
  let projectPath = url.split("/");
  infos.projectPath = projectPath
    .slice(projectPath.indexOf(infos.committish) + 1)
    .join("/");
  infos.url = projectPath
    .slice(0, projectPath.indexOf(infos.committish) - 1)
    .join("/");

  return infos;
}

async function deployDockerSwarm(dockerPath, stackName) {
  try {
    // Assure that docker-compose.yml exists
    if (!fs.existsSync(`${dockerPath}/docker-compose.yml`)) {
      throw new Error('docker-compose.yml not found in project');
    }

    // Deploy to Docker Swarm
    const { stdout, stderr } = await execAsync(
      `docker stack deploy -c ${dockerPath}/docker-compose.yml ${stackName} --with-registry-auth`,
      { env: process.env }
    );
    console.log('stdout:', stdout);
    console.error('stderr:', stderr);

    // Here, handle the response or errors appropriately
  } catch (error) {
    console.error('Error deploying to Docker Swarm:', error);
    throw error;
  }
}

async function getServiceTasks(stackName) {
  try {
    const { stdout, stderr } = await execAsync(`docker service ls --format "{{.ID}} {{.Name}} {{.Mode}} {{.Replicas}} {{.Image}} {{.Ports}}" | grep ${stackName}`);
    console.log('stdout:', stdout);
    if (stderr) {
      console.error('stderr:', stderr);
      throw new Error(stderr);
    }

    // Parse the output into a more manageable format if necessary
    return stdout.split('\n').filter(line => line !== '').map(line => {
      const parts = line.split(' ');
      return {
        id: parts[0],
        name: parts[1],
        mode: parts[2],
        replicas: parts[3],
        image: parts[4],
        ports: parts[5]
      };
    });
  } catch (error) {
    console.error('Error getting service tasks:', error);
    throw error;
  }
}

async function stopAndRemoveStack(stackName) {
  try {
    // Stop and remove the stack
    const { stdout, stderr } = await execAsync(`docker stack rm ${stackName}`);
    console.log('stdout:', stdout);
    if (stderr) {
      console.error('stderr:', stderr);
      throw new Error(stderr);
    }
  } catch (error) {
    console.error('Error stopping and removing stack:', error);
    throw error;
  }
}


async function checkDockerExists(githubUrl) {
  // Get git infos from Github Url
  let infos = await getInfosfromUrl(githubUrl);

  // Path where the project will be cloned
  let dockerPath = `${__dirname}/../dockers/${
    infos.user
  }/${infos.project.replace(" ", "_")}`;

  // Create directory for the project
  let res = await fs.mkdirSync(dockerPath, { recursive: true });

  // Setup github module from infos
  const git = simpleGit(dockerPath, {
    config: ["core.sparsecheckout=true"],
  });

  if (res) {
    await git.init();
    let url = `https://${infos.url.slice(8)}.git`;
    if (process.env.GITHUB_TOKEN) {
      url = `https://${process.env.GITHUB_TOKEN}@${infos.url.slice(8)}.git`;
    }
    await git.addRemote("origin", url);
  } else {
    await git.fetch();
  }

  dockerPath += `/${infos.projectPath}`;

  // Pull project
  await git.pull("origin", infos.committish);

  return dockerPath;
}

exports.deployDocker = async function (req, res) {
  console.log("deploy docker")
  const ownerId = req.body.ownerId;
  const challengeId = req.body.challengeId;

  try {
    if (progress.has(challengeId + "_" + ownerId)) {
      if (progress.get(challengeId + "_" + ownerId) != "stopping")
        throw Error("Docker is launching!");
      else if (progress.get(challengeId + "_" + ownerId) == "stopping")
        throw Error("Docker is stopping!");
    }

    await progress.set(challengeId + "_" + ownerId, "deploying");

    if (
      (await dockers.findOne({ dockerId: challengeId + "_" + ownerId })) !=
      undefined
    ) {
      progress.delete(challengeId + "_" + ownerId);
      throw new Error("Owner already has a docker running!");
    }

    const dockerPath = await checkDockerExists(req.body.githubUrl).catch(
      (e) => {
        console.log(e);
        throw Error("Failed!");
      }
    );

    if (
      !fs.existsSync(`${dockerPath}/docker-compose.yaml`) &&
      !fs.existsSync(`${dockerPath}/docker-compose.yml`)
    ) {
      progress.delete(challengeId + "_" + ownerId);
      throw new Error("docker-compose.yml not found in project");
    }

    const randomFlag = crypto.randomBytes(16).toString("hex");

    if (req.body.randomFlag) {
      // Create env
      fs.writeFileSync(
        path.join(dockerPath, "/" + ownerId + ".env"),
        "RANDOM_FLAG=" +
          process.env.RANDOM_FLAG_FORMAT.replace("RAND", randomFlag)
      );

      // launch docker
      if (process.env.INSWARM == "true") {
        res.send({ state: "error", message: "random flag option not supported with swarm :(" });
        return;
      }
      else {
      await compose.upAll({
        cwd: dockerPath,
        composeOptions: [
          ["-p", challengeId + "_" + ownerId],
          ["--env-file", ownerId + ".env"],
        ],
      });
      }
      // Delete env
      fs.rmSync(path.join(dockerPath, "/" + ownerId + ".env"));
    } else {
      // launch docker
      if (process.env.INSWARM == "true") {
        await deployDockerSwarm(dockerPath, challengeId + "_" + ownerId);
      } else {
      await compose.upAll({
        cwd: dockerPath,
        composeOptions: [["-p", challengeId + "_" + ownerId]],
      });
    }
  } 

    var containers;
    
    if (process.env.INSWARM == "true") {
      containers = await getServiceTasks(challengeId + "_" + ownerId);
      // containers = await getServiceTasks(challengeId + "_" + ownerId);
    } else {
      containers = await compose.ps({
        cwd: dockerPath,
        composeOptions: [["-p", challengeId + "_" + ownerId]],
      });
      
    }

    let i = 0;
    try {
      let port = "none";
      console.log("eeee")

      console.log("eeee")
      if (process.env.INSWARM == "true") {
        while(containers[i] && containers[i].ports.length == 0) {
          i += 1;
        }
        if (containers[i]) {
          port = containers[i].ports.split(":")[1].split("->")[0];
        } else {
          port = "none";
        }
      }
      else {

      while (
        containers.data.services[i] &&
        (containers.data.services[i].ports.length == 0 ||
          !containers.data.services[i].ports[0].hasOwnProperty("mapped"))
      ) {
        console.log(containers.data.services[i].ports);
        i += 1;
      }

      if (containers.data.services[i]) {
        port = containers.data.services[i].ports[0].mapped.port;
      } else {
          port = containers.out.split("0.0.0.0:")[1].split("->")[0];
      }
    }
      await dockers.create({
        dockerId: challengeId + "_" + ownerId,
        challengeId: challengeId,
        ownerId: ownerId,
        mappedPort: port,
        deployTime: new Date().getTime(),
        githubUrl: req.body.githubUrl,
        path: dockerPath,
        randomFlag: req.body.randomFlag
          ? process.env.RANDOM_FLAG_FORMAT.replace("RAND", randomFlag)
          : "false",
      });
    } catch (err) {
      await dockers.deleteOne({
        dockerId: challengeId + "_" + ownerId,
        challengeId: challengeId,
        ownerId: ownerId,
      });

      if (process.env.INSWARM == "true") {
        await stopAndRemoveStack(challengeId + "_" + ownerId);
      } else {
        await compose.stop({
          cwd: dockerPath,
          composeOptions: [["-p", challengeId + "_" + ownerId]],
        });
  
        await compose.rm({
          cwd: dockerPath,
          composeOptions: [["-p", challengeId + "_" + ownerId]],
        });
  
      }
     
      progress.delete(challengeId + "_" + ownerId);

      console.log(err);
      throw new Error("Error launching docker!");
    }

    progress.delete(challengeId + "_" + ownerId);

    if (req.body.randomFlag) res.send({ state: "success", flag: randomFlag });
    else res.send({ state: "success" });
  } catch (err) {
    console.log(err);
    if (err) {
      res.send({ state: "error", message: err.message });
    }
  }
};

exports.shutdownDocker = async function (req, res) {
  console.log("shutdown docker")
  const ownerId = req.body.ownerId;
  const challengeId = req.body.challengeId;

  try {
    if (progress.has(challengeId + "_" + ownerId)) {
      if (progress.get(challengeId + "_" + ownerId) != "stopping")
        throw Error("Docker is launching!");
      if (progress.get(challengeId + "_" + ownerId) == "stopping")
        throw Error("Docker is stopping!");
    }

    progress.set(challengeId + "_" + ownerId, "stopping");

    const docker = await dockers.findOne({
      dockerId: challengeId + "_" + ownerId,
    });

    if (!docker) {
      progress.delete(challengeId + "_" + ownerId);
      throw new Error("This Docker does not exist!");
    }

    // stop docker
    if (process.env.INSWARM == "true") {
      await stopAndRemoveStack(challengeId + "_" + ownerId);
    } else {
      await compose.stop({
        cwd: docker.path,
        composeOptions: [["-p", challengeId + "_" + ownerId]],
      });
      await compose.rm({
        cwd: docker.path,
        composeOptions: [["-p", challengeId + "_" + ownerId]],
      });
    }
    

    await dockers.deleteOne({
      dockerId: challengeId + "_" + ownerId,
      challengeId: challengeId,
      ownerId: ownerId,
    });

    progress.delete(challengeId + "_" + ownerId);
    res.send({ state: "success" });
  } catch (err) {
    if (err) {
      res.send({ state: "error", message: err.message });
    }
  }
};

exports.getDockers = async function (req, res) {
  console.log("get dockers")
  const ownerId = req.body.ownerId;
  // console.log(await dockers.find({ ownerId : ownerId }))
  const ownerDockers = (await dockers.find({ ownerId: ownerId })).map(
    (docker) => {
      let copy = { ...docker._doc, id: docker.id };

      if (progress.get(copy.dockerId)) {
        copy.progress = progress.get(docker.dockerId);
      }

      copy.url = `${process.env.DOCKER_URI}:${docker.mappedPort}`;

      return copy;
    }
  );

  res.send({ state: "success", dockers: ownerDockers });
};


exports.getAllDockers = async function (req, res) {
  console.log('get all dockers')
  const deployedDockers = (
    await dockers
      .find({})
      .skip((parseInt(req.body.page) - 1) * 100)
      .limit(100)
  ).map((docker) => {
    let copy = { ...docker._doc, id: docker.id };

    if (progress.get(copy.dockerId)) {
      copy.progress = progress.get(docker.dockerId);
    }

    copy.url = `${process.env.DOCKER_URI}:${docker.mappedPort}`;
    return copy;
  });

  res.send({ state: "success", dockers: deployedDockers });
};
