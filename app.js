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
  const getFollowersQuery = `
        SELECT 
            user.name AS name
        FROM user
        INNER JOIN follower ON user.user_id = follower.follower_user_id
        WHERE follower.following_user_id = ${userId};               
    `;
  const followersArray = await database.all(getFollowersQuery); // Corrected variable name
  response.send(followersArray);
});

//API 6

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { userId } = request;
  const { tweetId } = request.params;
  const tweetsQuery = `
    SELECT
    *
    FROM tweet
    WHERE tweet_id=${tweetId}
    `;
  const tweetResult = await database.get(tweetsQuery);
  const userFollowersQuery = `
    SELECT
    *
    FROM follower INNER JOIN user on user.user_id = follower.following_user_id
    WHERE follower.follower_user_id = ${userId};`;
  const userFollowers = await database.all(userFollowersQuery);
  if (
    userFollowers.some((item) => item.following_user_id === tweetResult.user_id)
  ) {
    //Error
    const tweet = await database.get(tweetsQuery);
    response.send(tweet);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//API 7

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { userId } = request;
    const { tweetId } = request.params;
    const tweetsQuery = `
    SELECT
    *
    FROM tweet
    WHERE tweet_id=${tweetId}
    `;
    const tweetResult = await database.get(tweetsQuery);
    const userFollowersQuery = `
    SELECT
    *
    FROM follower INNER JOIN user on user.user_id = follower.following_user_id
    WHERE follower.follower_user_id = ${userId};`;
    const userFollowers = await database.all(userFollowersQuery);
    if (
      userFollowers.some(
        (item) => item.following_user_id === tweetResult.user_id
      )
    ) {
      const getLikesQuery = `
            SELECT user.username
            FROM like
            INNER JOIN user ON like.user_id = user.user_id
            WHERE like.tweet_id = ${tweetId};
            `;

      const likesArray = await database.all(getLikesQuery);
      response.send({ likes: likesArray.map((like) => like.username) });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 8

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { userId } = request;
    const { tweetId } = request.params;
    const tweetsQuery = `
    SELECT
    *
    FROM tweet
    WHERE tweet_id=${tweetId}
    `;
    const tweetResult = await database.get(tweetsQuery);
    const userFollowersQuery = `
    SELECT
    *
    FROM follower INNER JOIN user on user.user_id = follower.following_user_id
    WHERE follower.follower_user_id = ${userId};`;
    const userFollowers = await database.all(userFollowersQuery);
    if (
      userFollowers.some(
        (item) => item.following_user_id === tweetResult.user_id
      )
    ) {
      const getRepliesQuery = `
        SELECT user.name, reply.reply
        FROM reply
        INNER JOIN user ON reply.user_id = user.user_id
        WHERE reply.tweet_id = ${tweetId};
        `;

      const repliesArray = await database.all(getRepliesQuery);
      response.send({ replies: repliesArray });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 9

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { userId } = request;
  const getTweetQuery = `
        SELECT
            tweet.tweet AS tweet,
            SUM(like.like_id) AS likes,
            SUM(reply.reply_id) AS replies,
            tweet.date_time AS dateTime
        FROM tweet
            INNER JOIN like on tweet.user_id = like.user_id
            INNER JOIN reply on like.user_id = reply.user_id
        WHERE
            tweet.user_id = ${userId};        
  `;
  const tweetsArray = await database.all(getTweetQuery);
  response.send(tweetsArray);
});

//API 10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const { username, userId } = request;
  const createTweetQuery = `
       INSERT INTO tweet (tweet, user_id)
       VALUES ('${tweet}', ${userId}); 
    `;
  await database.run(createTweetQuery);
  response.send("Created a Tweet");
});

//API 11
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { userId } = request;
    const { tweetId } = request.params;

    // Check if the tweet belongs to the user
    const getTweetQuery = `
      SELECT user_id FROM tweet WHERE tweet_id = ${tweetId};
    `;
    const tweet = await database.get(getTweetQuery);

    if (tweet === undefined) {
      response.status(400);
      response.send("Invalid Tweet");
    } else if (tweet.user_id !== userId) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      // Delete the tweet
      const deleteTweetQuery = `
        DELETE FROM tweet WHERE tweet_id = ${tweetId};
      `;
      await database.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
