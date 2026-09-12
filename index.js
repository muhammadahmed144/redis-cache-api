import dotenv from "dotenv";
dotenv.config();

import express from "express";
import dns from "node:dns";
import connectDB from "./config/dibi.js";
import { userModel } from "./model/users.js";
import { createClient } from "redis";
import { REDIS_URL, URL } from "./constant.js";

const app = express();

dns.setServers(["1.1.1.1", "8.8.8.8"]);

const redisClient = createClient({
  url: REDIS_URL,
});

redisClient.on("error", (err) => {
  console.error("Redis Error:", err);
});

(async () => {
  await redisClient.connect();
  console.log("redis connected successfully");
})();

const PORT = process.env.PORT || 3000;

app.put("/updateUser", (req, res) => {
  redisClient.del("users_expensive");
});

app.get("/users", async (req, res) => {
  const cacheKey = "users_expensive";

  console.time("redis-get");
  const usersRedis = await redisClient.get(cacheKey);
  console.timeEnd("redis-get");

  if (usersRedis) {
    const users = JSON.parse(usersRedis);

    console.log(users.length, "==>> Redis users (Cached)");
    return res.json(users);
  }
  if (!usersRedis) {
    console.time("mongo-query");
    const users = await userModel
      .find({
        $or: [
          { fullName: { $regex: "ven", $options: "i" } },
          { email: { $regex: "@gmail.com", $options: "i" } },
          { phoneNumber: { $regex: "03" } },
        ],
      })
      .sort({ createdAt: -1, fullName: 1, email: -1 })
      .skip(300)
      .limit(150);

    console.timeEnd("mongo-query");

    console.log("==>> going to save data in redis");

    await redisClient.set(cacheKey, JSON.stringify(users), {
      EX: 60,
    });

    console.log("==>> saved data in redis");

    return res.json(users);
  } else {
    console.log("====>> data received in redis");
    return res.json(JSON.parse(usersRedis));
  }
});

const startServer = async () => {
  try {
    // Pehle MongoDB connect hoga
    await connectDB();

    // MongoDB connect hone ke baad hi server start hoga
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("❌ MongoDB connection failed:");
    console.error(error.message);

    // Server start nahi hoga
    process.exit(1);
  }
};

startServer();
