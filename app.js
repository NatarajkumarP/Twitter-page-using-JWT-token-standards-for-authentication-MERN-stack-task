const express = require('express')
const app = express()
app.use(express.json())

const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const dbPath = path.join(__dirname, 'twitterClone.db')

const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

let db = null

const initializeServerConnection = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server connection started http://localhost:3000/....')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}

initializeServerConnection()

const authentication = (request, response, next) => {
  const {tweet} = request.body
  const {tweetId} = request.params
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_KEY', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.payload = payload
        request.tweetId = tweetId
        request.tweet = tweet
        next()
      }
    })
  }
}

// API-1

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const getUserQuery = `SELECT * FROM user WHERE username = "${username}";`
  console.log(username, password, name, gender)

  const getDBDetails = await db.get(getUserQuery)

  if (getDBDetails !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hashedPassword = await bcrypt.hash(password, 10)
      const createUserQuery = `INSERT INTO user(name, username, password, gender)
      VALUES ("${name}", "${username}","${hashedPassword}", "${gender}");`
      await db.run(createUserQuery)
      response.status(200)
      response.send('User created successfully')
    }
  }
})

//API-2

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const getUserQuery = `SELECT * FROM user WHERE username = "${username}";`
  console.log(username, password)
  const userDbDetails = await db.get(getUserQuery)
  if (userDbDetails !== undefined) {
    const isPasswordCorrect = await bcrypt.compare(
      password,
      userDbDetails.password,
    )
    if (isPasswordCorrect === true) {
      const jwtToken = jwt.sign(userDbDetails, 'MY_SECRET_KEY')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  } else {
    response.status(400)
    response.send('Invalid user')
  }
})

//API-3

app.get('/user/tweets/feed/', authentication, async (request, response) => {
  const {payload} = request
  const {user_id, name, username, gender} = payload
  console.log(name)
  const getTweetsQuery = `SELECT 
  username, 
  tweet, 
  date_time AS dateTime 
  FROM follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id 
  INNER JOIN user ON user.user_id = follower.following_user_id WHERE follower.follower_user_id = "${user_id}"
  ORDER BY date_time DESC LIMIT 4;`
  const tweets = await db.all(getTweetsQuery)
  response.send(tweets)
})

//API-4

app.get('/user/following/', authentication, async (request, response) => {
  const {payload} = request
  const {user_id, name, username, gender} = payload
  console.log(name)
  const getFollowingUsersQuery = `SELECT name FROM user INNER JOIN follower ON 
  user.user_id = follower.following_user_id WHERE follower.follower_user_id = ${user_id};`
  const followingPeople = await db.all(getFollowingUsersQuery)
  response.send(followingPeople)
})

//API-5

app.get('/user/followers/', authentication, async (request, response) => {
  const {payload} = request
  const {user_id, name, username, gender} = payload
  console.log(name)
  const getFollowersQuery = `SELECT name FROM user INNER JOIN follower 
  ON user.user_id = follower.follower_user_id WHERE follower.following_user_id = ${user_id};`
  const followers = await db.all(getFollowersQuery)
  response.send(followers)
})

//API-6

app.get('/tweets/:tweetId/', authentication, async (request, response) => {
  const {tweetId} = request
  const {payload} = request
  const {user_id, name, username, gender} = payload

  const tweetsQuery = `SELECT * FROM tweet WHERE tweet_id = ${tweetId};`
  const tweetsResult = await db.get(tweetsQuery)
  const userFollowersQuery = `SELECT * FROM follower INNER JOIN user ON user.user_id = follower.following_user_id
    WHERE follower.follower_user_id = ${user_id};`

  const userFollowers = await db.all(userFollowersQuery)
  if (
    userFollowers.some(item => item.following_user_id === tweetsResult.user_id)
  ) {
    const getTweetDetailsQuery = `SELECT 
      tweet, 
      COUNT(DISTINCT(like.like_id)) AS likes, 
      COUNT(DISTINCT(reply.reply_id)) AS replies
      tweet.date_time AS dateTime
      FROM tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
      WHERE tweet.tweet_id = "${tweetId}" AND tweet.user_id = ${userFollowers[0].user_id};`
    const tweetDetails = await db.get(getTweetDetailsQuery)
    response.send(tweetDetails)
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})

//API-7

app.get(
  '/tweets/:tweetId/likes/',
  authentication,
  async (request, response) => {
    const {tweetId} = request
    const {payload} = request
    const {user_id, name, username, gender} = payload

    const getLikesQuery = `SELECT * FROM follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id
    INNER JOIN user ON user.user_id = like.user_id 
    WHERE tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id};`

    const likedUser = await db.all(getLikesQuery)
    if (likedUser.length !== 0) {
      let likes = []
      const getNamesArray = likedUsers => {
        for (let item of likedUsers) {
          likes.push(item.username)
        }
      }
      getNamesArray(likedUser)
      response.send({likes})
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

//API-8

app.get(
  '/tweets/:tweetId/replies/',
  authentication,
  async (request, response) => {
    const {tweetId} = request
    const {payload} = request
    const {user_id, name, username, gender} = payload
    console.log(name, tweetId)
    const getRepliedUserQuery = `SELECT * FROM follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
    INNER JOIN user ON user.user_id = reply.user_id 
    WHERE 
    tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id};`
    const repliedUsers = await db.all(getRepliedUserQuery)
    console.log(repliedUsers)
    if (repliedUsers.length !== 0) {
      let replies = []
      const getNamesArray = repliedUsers => {
        for (let item of repliedUsers) {
          let objects = {
            name: item.name,
            reply: item.reply,
          }
          replies.push(objects)
        }
      }
      getNamesArray(repliedUsers)
      response.send({replies})
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

//API-9

app.get('/user/tweets/', authentication, async (request, response) => {
  const {payload} = request
  const {user_id, name, username, gender} = payload

  const getTweetsQuery = `SELECT tweet.tweet AS tweet, 
  COUNT(DISTINCT(like.like_id)) AS likes,
  COUNT(DISTINCT(reply.reply_id)) AS replies,
  tweet.date_time AS dateTime 
  FROM user INNER JOIN tweet ON user.user_id = tweet.user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
  WHERE user.user_id = ${user_id}
  GROUP BY tweet.tweet_id;`
  const tweets = await db.all(getTweetsQuery)
  response.send(tweets)
})

//API-10

app.post('/user/tweets/', authentication, async (request, response) => {
  const {tweet} = request
  const {tweetId} = request
  const {payload} = request
  const {user_id, name, username, gender} = payload

  const createTweetQuery = `INSERT INTO tweet(tweet, user_id)
  VALUES ("${tweet}", ${user_id});`

  await db.run(createTweetQuery)
  response.send('Created a Tweet')
})

//API-11

app.delete('/tweets/:tweetId/', authentication, async (request, response) => {
  const {tweetId} = request
  const {payload} = request
  const {user_id, name, username, gender} = payload

  const getTheTweetQuery = `SELECT * FROM tweet WHERE tweet.user_id = "${user_id}" AND tweet.tweet_id = "${tweetId}";`

  const tweet = await db.all(getTheTweetQuery)
  if (tweet.length !== 0) {
    const deleteTweetQuery = `DELETE FROM tweet WHERE tweet.user_id = "${user_id}" AND tweet.tweet_id = "${tweetId}";`
    await db.run(deleteTweetQuery)
    response.send('Tweet Removed')
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})

module.exports = app
