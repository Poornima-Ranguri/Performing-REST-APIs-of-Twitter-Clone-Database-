const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());
const databasePath = path.join(__dirname, "twitterClone.db");

let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB Error ${e.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }

  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "pppgggpppgggpppgggpp", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${payload.username}'`;
        const user = await database.get(getUserIdQuery);
        request.userId = user.user_id;
        request.username = payload.username;

        next();
      }
    });
  }
};

const authenticateTweetToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }

  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "pppgggpppgggpppgggpp", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${payload.username}'`;
        const user = await database.get(getUserIdQuery);

        request.userId = user.user_id;
        request.username = payload.username;
        const { tweetId } = request.params;

        const userId = user.user_id;

        const getFollowersQuery = `
        SELECT 
            name AS name
        FROM user
            INNER JOIN follower
                ON user.user_id = follower.following_user_id
        WHERE
            follower.follower_user_id = ${userId};                
    `;

        const followersArray = await database.all(getFollowersQuery);

        if (followersArray.includes(tweetId)) {
          next();
        } else {
          request.status(401);
          request.send("Invalid Request");
        }
      }
    });
  }
};
// API 1 CREATE USER

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `
        SELECT 
          *
        FROM
            user
        WHERE
            username = '${username}';    
  `;
  const dbUser = await database.get(selectUserQuery);

  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUserQuery = `INSERT INTO user(name, username, password, gender) VALUES('${name}', '${username}', '${hashedPassword}', '${gender}');`;

      await database.run(createUserQuery);

      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//API 2 /login/

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
        SELECT 
          *
        FROM
            user
        WHERE
            username = '${username}';    
  `;
  const dbUser = await database.get(selectUserQuery);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "pppgggpppgggpppgggpp");

      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API 3 Returning Tweets

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { username, userId } = request;

  const getTweetsQuery = `
             SELECT
                user.username, tweet.tweet, tweet.date_time AS dateTime
            FROM
                follower
                INNER JOIN tweet
                ON follower.following_user_id = tweet.user_id
                INNER JOIN user
                ON tweet.user_id = user.user_id
             WHERE
                follower.follower_user_id = ${userId}
                ORDER BY
                tweet.date_time DESC
                LIMIT 4;`;

  const tweetsArray = await database.all(getTweetsQuery);
  response.send(tweetsArray);
});

//API 4

app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username, userId } = request;

  const getFollowersQuery = `
        SELECT 
            name AS name
        FROM user
            INNER JOIN follower
                ON user.user_id = follower.following_user_id
        WHERE
            follower.follower_user_id = ${userId};                
    `;

  const followersArray = await database.all(getFollowersQuery);
  response.send(followersArray);
});

//API 5

app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username, userId } = request;
  const getFollowingQuery = `
        SELECT 
            name AS name
        FROM user
            INNER JOIN follower
                ON follower.following.user_id = follower.follower_user_id
        WHERE
            follower.follower_user_id = ${userId};               
    `;
  //ERROR
  const followingArray = await database.all(getFollowersQuery);
  response.send(followingArray);
});

//API 6

app.get(
  "/tweets/:tweetId",
  authenticateTweetToken,
  async (request, response) => {
    const { userId } = request;
    const { tweetId } = request.params;

    const getTweetQuery = `
        SELECT
            tweet.tweet,
            COUNT(like.like_id) AS likes,
            COUNT(reply.reply_id) AS replies,
            tweet.date_time AS dateTime
        FROM tweet
            JOIN user ON tweet.user_id = user.user_id   
            JOIN follower ON user.user_id = follower.following_id
            LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
            LEFT JOIN like ON tweet.tweet_id = like.tweet_id
        WHERE
            tweet.tweet_id = ${tweetId}
            AND follower.follower_id = ${userId}
        GROUP BY
            tweet.tweet, tweet.date_time;        
  `;

    const tweet = await database.get(getTweetQuery);
    response.send(tweet);
  }
);

//API 7

//API 8

//API 9

//API 10

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const { username } = request;

  const createTweetQuery = `
       INSERT INTO tweet (tweet, user_id, date_time)
       VALUES ('${tweet}', ${userId}, DATETIME('now')); 
    `;

  await database.run(createTweetQuery);
  response.send("Created a Tweet");
});

module.exports = app;
