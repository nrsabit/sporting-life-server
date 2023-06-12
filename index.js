const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion } = require("mongodb");

// middlewares
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.h7lvo9z.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    const usersCollection = client.db("sportingLife").collection("users");
    const classesCollection = client.db("sportingLife").collection("classes");
    const selectedCollection = client.db("sportingLife").collection("selected");

    // jwt related apis 
    const verifyJWT = (req, res, next) => {
      const authorization = req.headers.authorization;
      if (!authorization) {
        return res
          .status(401)
          .send({ error: true, message: "unauthorized access" });
      }
      const token = authorization.split(" ")[1];
      jwt.verify(token, process.env.JWT_SECRET_KEY, (eror, decoded) => {
        if (eror) {
          return res
            .status(401)
            .send({ error: true, message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.JWT_SECRET, {
        expiresIn: "1hr",
      });
      res.send({ token });
    });

    // users related apis
    app.post("/users", async (req, res) => {
      const user = req.body;
      const email = user.email;
      const query = { email: email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists" });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // instructors related apis
    app.get("/instructors", async (req, res) => {
      const limit = req.query.limit;
      const query = { role: "instructor" };
      if (limit) {
        const result = await usersCollection.find(query).limit(6).toArray();
        res.send(result);
        return;
      }
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });

    // classes related apis
    app.get("/classes", async (req, res) => {
      const topClasses = req.query.top;
      if (topClasses) {
        const result = await classesCollection
          .find()
          .sort({ numberOfStudents: -1 })
          .limit(6)
          .toArray();
        console.log(result);
        res.send(result);
        return;
      }
      const result = await classesCollection.find().toArray();
      res.send(result);
    });

    app.post("/select-class", async (req, res) => {
      const selectedClass = req.body;
      const result = await selectedCollection.insertOne(selectedClass);
      res.send(result);
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Sporting Life Server is Running");
});

app.listen(port, () => {
  console.log(`Sporting life Server is running on Port: ${port}`);
});
