const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

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
    const paymentsCollection = client.db("sportingLife").collection("payments");
    const enrolledCollection = client.db("sportingLife").collection("enrolled");

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
      const token = jwt.sign(user, process.env.JWT_SECRET_KEY, {
        expiresIn: "7d",
      });
      res.send({ token });
    });

    // admin verification
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === "admin" ? true : false;
      if (!isAdmin) {
        return res
          .status(403)
          .send({ error: true, message: "forbidded access" });
      }
      next();
    };

    // instructor verificaion
    const verifyInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isInstructor = user?.role === "instructor" ? true : false;
      if (!isInstructor) {
        return res
          .status(403)
          .send({ error: true, message: "forbidded access" });
      }
      next();
    };

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

    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.get("/user", async (req, res) => {
      const email = req.query.email;
      if (req.decoded.email !== email) {
        return res
          .status(401)
          .send({ error: true, message: "unauthorized access" });
      }
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    app.patch("/update-user/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const role = req.query.role;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: role,
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // admin related apis
    app.get("/user/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        res.send({ admin: false });
        return;
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      res.send({ admin: user?.role === "admin" });
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

    app.get("/user/instructor/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        res.send({ instructor: false });
        return;
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      res.send({ instructor: user?.role === "instructor" });
    });

    // classes related apis
    app.get("/classes", async (req, res) => {
      const topClasses = req.query.top;
      const query = { status: "approved" };
      if (topClasses) {
        const result = await classesCollection
          .find(query)
          .sort({ numberOfStudents: -1 })
          .limit(6)
          .toArray();
        res.send(result);
        return;
      }
      const result = await classesCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/all-classes", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await classesCollection.find().toArray();
      res.send(result);
    });

    app.post("/select-class", async (req, res) => {
      const selectedClass = req.body;
      const result = await selectedCollection.insertOne(selectedClass);
      res.send(result);
    });

    app.post("/classes", verifyJWT, verifyInstructor, async (req, res) => {
      const newClass = req.body;
      const result = await classesCollection.insertOne(newClass);
      res.send(result);
    });

    app.get("/my-classes", verifyJWT, verifyInstructor, async (req, res) => {
      const email = req.query.email;
      if (req.decoded.email !== email) {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }
      const query = { instructorEmail: email };
      const result = await classesCollection.find(query).toArray();
      res.send(result);
    });

    // selected classes related apis
    app.get("/selected", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      if (!email) {
        res.send([]);
        return;
      } else {
        if (email !== decodedEmail) {
          return res
            .status(401)
            .send({ error: true, message: "unauthorized access" });
        }
        const query = { email: email };
        const result = await selectedCollection.find(query).toArray();
        res.send(result);
      }
    });

    app.get("/selected/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await selectedCollection.findOne(query);
      res.send(result);
    });

    app.delete("/selected/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await selectedCollection.deleteOne(query);
      res.send(result);
    });

    // Payment Related apis (create payment intent)
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });

    app.post("/payment", verifyJWT, async (req, res) => {
      const newPayment = req.body;
      const result = await paymentsCollection.insertOne(newPayment);
      res.send(result);
    });

    app.get("/payments", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (req.decoded.email !== email) {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }
      const query = { email: email };
      const result = await paymentsCollection
        .find(query)
        .sort({ date: -1 })
        .toArray();
      res.send(result);
    });

    // enrolled class related apis
    app.post("/enrolled", async (req, res) => {
      const enrolledClass = req.body;
      const result = await enrolledCollection.insertOne(enrolledClass);
      res.send(result);
    });

    app.get("/enrolled", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (req.decoded.email !== email) {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }
      const query = { email: email };
      const result = await enrolledCollection.find(query).toArray();
      res.send(result);
    });

    // update class
    app.patch("/class/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const mainClass = await classesCollection.findOne(filter);
      const updateDoc = {
        $set: {
          availableSeats: mainClass?.availableSeats - 1,
          numberOfStudents: mainClass?.numberOfStudents + 1,
        },
      };
      const result = await classesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.patch("/update-class-status/:id", async (req, res) => {
      const id = req.params.id;
      const status = req.query.status;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: status,
        },
      };
      const result = await classesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.patch(
      "/update-feedback/:id",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const feedback = req.body.feedback;
        if (!feedback) {
          return;
        }
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            feedback: feedback,
          },
        };
        const result = await classesCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );
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
