const express = require('express')
const mongoose = require('mongoose');
const app = express();

app.use(express.json());

// Connect to MongoDB, with the database name "HKPassFlow" and the collection name "monthlog"
mongoose.connect('mongodb://mongodb/HKPassFlow');
var db = mongoose.connection;

// Continue to monitor the db connection. Once the db connection failed, terminate the program.
db.on("error", (err) => {
  console.log("MongoDB connection error: " + err);
  process.exit(1);
});
db.on("connected", () => {
  console.log("Connected to MongoDB");
});
db.on("disconnected", () => {
    console.log("Disconnected from MongoDB");
    process.exit(1);
});

// Set the Schema
var mySchema = new mongoose.Schema({
    Year: Number,
    Month: Number,
    Local: Number,
    Mainland: Number,
    Others: Number,
    Total: Number
}, {collection: 'monthlog'});

// Create the model
var mymodel = mongoose.model("Monthlog", mySchema);

// TASK B, D
app.get('/HK/stat/:year/:group?', async (req, res) => {

    var year = req.params.year;
    var group = req.params.group;
    var month = req.params.group;
    var errCode = 0;

    // Validate year format and range
    if (!/^\d{4}$/.test(year) || year < 2021 || year > 2025) {
        errCode = 1;
    }
    // Validate group
    const validGroups = ['local', 'mainland', 'others'];
    if (validGroups.includes(group)) {
        if (errCode == 1) {
            return res.status(400).json({ error: "Wrong year - must be between 2021 - 2025." });
        }
        const groupField = group === 'local' ? 'Local' : group === 'mainland' ? 'Mainland' : 'Others';

        try {
            const data = await mymodel.aggregate([
                { $match: { Year: parseInt(year) } },
                { $sort: { Month: 1 } },
                {
                    $project: {
                        _id: 0,
                        Month: "$Month",
                        Value: `$${groupField}`
                    }
                },
            ]);

            if (!data.length) {
                return res.status(404).json({ error: `No data for ${year}` });
            }
            const responseData = data.map(item => ({
                Month: item.Month,
                [groupField]: item.Value
            }));
            return res.json(responseData);
        } catch (err) {
            return res.status(500).json({ error: "Failed to fetch data" });
        }
    }

    // Validate month format and range
    if (month && (!/^\d{1,2}$/.test(month) || month < 1 || month > 12)) {
        errCode += 2;
    }

    // Return error message if year or month is invalid
    if (errCode == 1) {
        return res.status(400).json({ error: "Wrong year - must be between 2021 - 2025." });
    } else if (errCode == 2) {
        return res.status(400).json({ error: "Wrong month." });
    } else if (errCode == 3) {
        return res.status(400).json({ error: "Wrong year - must be between 2021 - 2025. Wrong month." });
    }

    // Fetch data from MongoDB
    try {
        if (month) {
            // Fetch year-month data
            const data = await mymodel.findOne({ Year: year, Month: month }, { _id: 0, __v: 0 });
            if (!data) {
                return res.status(404).json({ error: `No data for ${month}/${year}` });
            }
            res.json(data);
        } else {
            // Fetch and sum data for the whole year
            const data = await mymodel.aggregate([
                { $match: { Year: parseInt(year) } },
                {
                    $group: {
                        _id: "$Year",
                        Local: { $sum: "$Local" },
                        Mainland: { $sum: "$Mainland" },
                        Others: { $sum: "$Others" },
                        Total: { $sum: "$Total" }
                    }
                }
            ]);
            if (!data.length) {
                return res.status(404).json({ error: `No data for year ${year}` });
            }
            const responseData = data.map(item => ({
                Year: item._id,
                Local: item.Local,
                Mainland: item.Mainland,
                Others: item.Others,
                Total: item.Total
            }));
            res.json(responseData);
        }
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch data" });
    }
});

// TASK C
// POST endpoint to add new data
app.post('/HK/stat', async (req, res) => {

    if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({ error: "POST request - missing data." });
      }
    const entries = req.body;
    try {
        const year = entries[0].Year;
        const month = entries[0].Month;
        const data = await mymodel.findOne({ Year: year, Month: month });
        if (data) {
            return res.status(409).json({ error: `Record exists for ${month}/${year}; cannot overwrite.` });
        }
        var local = 0;
        var mainland = 0;
        var others = 0;
        var total = 0;

        for (let entry of entries) {
            if (entry.Flow == "Arrival") {
                local += entry.Local;
                mainland += entry.Mainland;
                others += entry.Others;
                total += entry.Local + entry.Mainland + entry.Others;
            }
            else if (entry.Flow == "Departure") {
                local -= entry.Local;
                mainland -= entry.Mainland;
                others -= entry.Others;
                total -= (entry.Local + entry.Mainland + entry.Others);
            }
        }

        const newEntry = new mymodel({
            Year: year, 
            Month: month, 
            Local: local, 
            Mainland: mainland, 
            Others: others, 
            Total: total
        });
        
        try {
            const savedEntry = await newEntry.save();
            // return the saved data in JSON format
            const responseData = savedEntry.toObject();
            delete responseData._id;
            delete responseData.__v;
            res.json(responseData);
        } catch (err) {
            res.status(500).json({ error: "Failed to save data" });
        }
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch data" });
    }
  });

// GET endpoint to retrieve data
/*app.get('/HK/stat/:year/:group', async (req, res) => {

    var year = req.params.year;
    var group = req.params.group;

    if (!/^\d{4}$/.test(year) || year < 2021 || year > 2025) {
        return res.status(400).json({ error: "Wrong year - must be between 2021 - 2025." });
    }

    const validGroups = ['local', 'mainland', 'others'];
    if (!validGroups.includes(group)) {
        return res.status(400).json({ error: "Invalid group type." });
    }

    const groupField = group === 'local' ? 'Local' : group === 'mainland' ? 'Mainland' : 'Others';

    try {
        const data = await mymodel.aggregate([
            { $match: { Year: parseInt(year) } },
            { $sort: { Month: 1 } },
            {
                $project: {
                    _id: 0,
                    Month: "$Month",
                    Value: `$${groupField}`
                }
            },
        ]);

        if (!data.length) {
            return res.status(404).json({ error: `No data for ${year}` });
        }
        const responseData = data.map(item => ({
            Month: item.Month,
            [groupField]: item.Value
        }));
        res.json(responseData);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch data" });
    }
});*/

app.all('*', (req, res) => {
    res.status(400).json({ error: `Cannot ${req.method} ${req.path}` });
});

app.listen(3000, () => {
  console.log('App listening on port 3000!')
});