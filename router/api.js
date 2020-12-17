const router = require("express").Router();

//Models
const User = require("../models/User/User");
const Item = require("../models/Items/Item");
const ItemUserCon = require("../models/Items/ItemUserCon");
const Attack = require("../models/Monster/Attack");
const UserMonster = require("../models/Monster/UserMonster");
const DiscServer = require("../models/Server");
const Monster = require("../models/Monster/Monster");
const Job = require("../models/User/Job");
const ApiToken = require("../models/ApiToken");
const AiMonster = require("../models/Monster/AiMonster");

//middleware
const verify = require("../middleware/verifyApiToken");
const UserJob = require("../models/User/UserJob");

//API Token creator
router.post("/apiToken", async(req, res) => {
    const pw = req.body.pw;
    const pww = process.env.SECRET_API_PW;

    //if there is no pw
    //disabled!
    //if (!pww)
    return res.status(401).json({ status: "401", message: "HAHAHA nope!" });

    if (pw == pww) {
        var nToken = "";
        while (true) {
            nToken = makeToken(100);
            const tToken = await ApiToken.findOne({ token: nToken });
            if (!tToken)
                break;
        }

        const sToken = new ApiToken({
            token: nToken
        });

        try {
            const savedToken = await sToken.save();
        } catch (err) {
            console.log("an error occured! " + err);
            res.status(200).json({
                status: 400,
                message: "error while creating token!",
                error: err,
            });
        }
        res.status(200).json({ status: "200", data: nToken });
    } else {
        res.status(401).json({ status: "401", message: "HAHAHA nope!" });
    }
});

router.post("/getAttacks", verify, async(req, res) => {
    const monster = req.body.monster;
    const mnster = await Monster.findById(monster);
    const atts = mnster.attacks;
    var attacks = [atts.length];

    for (let i = 0; i < atts.length; i++) {
        calcDmg.push(await Attack.findById(atts[i]));
    }
    res.status(200).json({ status: 200, data: attacks, message: "Fetched attacks from monster" });
});

router.post("/createFight", verify, async(req, res) => {
    const user = await getUser(req.body);
    if (!user)
        return res.status(200).json({ status: 400, message: "User not found!" });

    const t = await AiMonster.findOne({ user: user._id });
    if (t)
        await t.remove();

    var mnsters = await Monster.find();
    shuffle(mnsters);
    const mnster = mnsters[0];

    const newAi = new AiMonster({
        rootMonster: mnster._id,
        level: getRandomInt(mnster.initialLevel, mnster.initialLevel + 10),
        dv: getRandomInt(0, 15),
        hp: mnster.baseHp,
        maxHp: mnster.baseHp,
        user: user._id
    });

    const sAi = await newAi.save();
    res.status(200).json({ status: 200, data: sAi, message: "Created ai monster" });
});

router.post("/giveRandomItem", verify, async(req, res) => {
    const user = await getUser(req.body);
    if (!user)
        return res.status(200).json({ status: 400, message: "User not found!" });

    const amount = req.body.amount;
    var rar = req.body.rarity;
    if (!rar)
        rar = 0;
    else
        rar = stringToRarityInt(rar);

    var its = [];

    for (let i = 0; i < amount; i++) {
        const dItem = await getRandomItem(rar);
        if (!dItem)
            return res.status(200).json({ status: 400, message: "No Item for rarity found!" });

        giveUserItem(1, dItem, user);
        its.push(dItem);
    }

    res.status(200).json({ status: 200, data: its, message: "Created ai monster" });
});

router.post("/userRandomMonster", verify, async(req, res) => {
    var user = await getUser(req.body);
    var rar = 0;
    if (req.body.rarity)
        rar = stringToRarityInt(req.body.rarity)

    if (!user)
        return res.status(200).json({ status: 400, message: "User not found!" });

    var mnsters = await Monster.find({});
    mnsters = shuffle(mnsters);
    var mnster = undefined;
    for (let i = 0; i < mnsters.length; i++) {
        var element = mnsters[i];
        if (stringToRarityInt(element.rarity) >= rar) {
            mnster = element;
            break;
        }
    }
    if (!mnster)
        return res.status(200).json({ status: 400, message: "No monster with rarityy found!" });

    var umnster = new UserMonster({
        rootMonster: mnster._id,
        hp: mnster.baseHp,
        maxHp: mnster.baseHp,
        user: user._id,
        dv: getRandomInt(0, 15)
    });

    var u = undefined;
    try {
        u = await umnster.save();
    } catch (err) {
        console.log("an error occured! " + err);
        res.status(200).json({
            status: 400,
            message: "error while creating new user!",
            error: err,
        });
    }

    return res.status(200).json({ status: 200, message: "Added monster", data: mnster });
});

//every fight step, just calculation
router.post("/fight", verify, async(req, res) => {
    const user = await getUser(req.body);
    const m1 = req.body.monster1;
    const m2 = req.body.monster2;
    const isAi1 = req.body.ai1;
    const isAi2 = req.body.ai2;
    const attck = req.body.attack;

    if (!user)
        return res
            .status(200)
            .json({ status: 400, message: "Request is mssing arguments" });

    var monster1 = undefined;
    var monster2 = undefined;

    if (isAi1) {
        monster1 = await AiMonster.findOne({ user: user._id });
    } else {
        monster1 = await UserMonster.findById(m1);
    }

    if (isAi2) {
        monster2 = await AiMonster.findOne({ user: user._id });
    } else {
        monster2 = await UserMonster.findById(m2);
    }

    if (!monster1 || !monster2)
        return res.status(200).json({ status: 400, message: "Monster not found! AII" });

    var attack = undefined;
    if (isAi1) {
        const mroot = await Monster.findById(monster1.rootMonster);
        if (!mroot)
            return res.status(200).json({ status: 400, message: "Monster not found! AI" });
        var atts = mroot.attacks;
        shuffle(atts);
        attack = atts[0];
    } else {
        attack = attck;
    }

    attack = await Attack.findById(attack);
    const dmg = calcDmg(attack, monster1, monster2);

    monster2.hp = monster2.hp - dmg;
    const sMonster = await monster2.save();

    res.status(200).json({ status: "200", monster1: monster1, monster2: sMonster, attack: attack, dmg: dmg });
});

router.post("/getServer", verify, async(req, res) => {
    const server = await getServer(req.body);

    if (!server)
        return res.status(200).json({ status: 400, message: "Server not found!" });
    //maybe to this in more specific json text yk...
    res.status(200).json({ status: "200", data: server });
});

router.post("/getUser", verify, async(req, res) => {
    const user = await getUser(req.body);

    if (!user)
        return res.status(200).json({ status: 400, message: "User not found!" });
    //maybe to this in more specific json text yk...
    res.status(200).json({ status: "200", data: user });
});

router.get("/getUser", verify, async(req, res) => {
    const user = await User.find();

    var usrs = [];

    for (let i = 0; i < user.length; i++) {
        if (user.edit)
            usrs.push(user[i]);
    }
    res.status(200).json({ status: "200", data: usrs });
});

router.post("/getUserInventory", verify, async(req, res) => {
    const user = await getUser(req.body);
    if (!user)
        return res.status(200).json({ status: 400, message: "User not found!" });
    var inventory = await ItemUserCon.find({ user: user._id });
    if (!inventory)
        return res
            .status(200)
            .json({ status: 400, message: "Inventory not found!" });

    for (let i = 0; i < inventory.length; i++) {
        const it = await Item.findById(inventory[i].item);
        inventory[i].itemName = it.itemName;
        delete inventory[i].user;
    }

    res.status(200).json({ status: 200, data: inventory });
});

router.post("/getUserMonsters", verify, async(req, res) => {
    const user = await getUser(req.body);
    if (!user)
        return res.status(200).json({ status: 400, message: "User not found!" });
    var monsters = await UserMonster.find({ user: user._id });
    if (!monsters)
        return res.status(200).json({ status: 400, message: "Monster not found!" });
    res.status(200).json({ status: 200, data: monsters });
});

router.post("/userItem", verify, async(req, res) => {
    const si = req.body.item;
    const amount = req.body.amount;
    var item = await Item.findById(si);
    if (!item)
        return res.status(200).json({ status: 400, message: "item not found!" });
    var user = await getUser(req.body);
    if (!user)
        return res.status(200).json({ status: 400, message: "User not found!" });
    savedItem = giveUserItem(amount, item, user)
    res.status(200).json({ status: 200, _id: savedItem._id, message: "added/removed item to/from player" });
});

router.post("/work", verify, async(req, res) => {
    var user = await getUser(req.body);
    if (!user) return res
        .status(200)
        .json({ status: 400, message: "User not found!" });

    var userJob;
    try {
        userJob = await UserJob.findById(user.job);
    } catch (err) {
        console.log("an error occured! " + err);
        return res
            .status(200)
            .json({ status: 400, message: "User job not found!" });
    }

    var ONE_HOUR = 60 * 60 * 1000;
    var time = ((new Date) - user.lastWorkTime);
    if (time < ONE_HOUR) {
        return res
            .status(200)
            .json({ status: 400, message: "Can work in" + time * 1000, data: time * 1000 });
    }

    var job;
    try {
        job = await Job.findById(userJob.job);
    } catch (err) {
        console.log("an error occured! " + err);
        return res
            .status(200)
            .json({ status: 400, message: "Job not found!" });
    }
    var cAdd;
    if (userJob.jobPosition == "trainee") {
        cAdd = job.earningTrainee;
    } else if (userJob.jobPosition == "coworker") {
        cAdd = job.earningCoworker;
    } else if (userJob.jobPosition == "headofdepartment") {
        cAdd = job.earningHeadOfDepartment;
    } else if (userJob.jobPosition == "manager") {
        cAdd = job.earningManager;
    } else {
        return res
            .status(200)
            .json({ status: 400, message: "Job document fail" });
    }
    try {
        user.coins += cAdd;
        await user.save();
    } catch (err) {
        console.log("an error occured! " + err);
        return res
            .status(200)
            .json({ status: 400, message: "Database error!" });
    }
    res.status(200).json({ status: 200, message: "Added coins!", data: cAdd });
});

router.post("/userJob", verify, async(req, res) => {
    const job = req.body.job;
    var jjob;
    try {
        jjob = await Job.findById(job);
    } catch (e) {
        return res
            .status(200)
            .json({ status: 400, message: "Job not found" });
    }
    var user = await getUser(req.body);
    if (!user) return res
        .status(200)
        .json({ status: 400, message: "User not found!" });

    var jPos = req.body.jPos;
    if (jPos == "trainee") {} else if (jPos == "coworker") {} else if (jPos == "head" || jPos == "headofdepartment") {
        jPos = "headofdepartment";
    } else if (jPos == "manager") {} else {
        return res
            .status(200)
            .json({ status: 400, message: "Invalid Job role!" });
    }

    const uJob = new UserJob({
        job: job,
        jobLevel: 1,
        jobXP: 0,
        jobPosition: jPos
    });
    try {
        const savedJob = await uJob.save();
        user.job = savedJob._id;
        await user.save();
        res.status(200).json({ status: 200, _id: savedJob._id, message: "added job to user" });
    } catch (err) {
        console.log("an error occured! " + err);
        res.status(200).json({
            status: 400,
            message: "error while creating new user!",
            error: err,
        });
    }
});

router.delete("/userJob", verify, async(req, res) => {
    var user = await getUser(req.body);
    if (!user) return res
        .status(200)
        .json({ status: 400, message: "User not found!" });

    try {
        const userJob = UserJob.findById(user.job);
        await userJob.remove();
    } catch (err) {
        console.log("an error occured! " + err);
    }
    try {
        user.job = undefined;
        await user.save();
        res.status(200).json({ status: 200, message: "deleted!" });
    } catch (err) {
        console.log("an error occured! " + err);
        res.status(200).json({
            status: 400,
            message: "error while creating new user!",
            error: err,
        });
    }
});

router.post("/coins", verify, async(req, res) => {
    const coins = req.body.coins;
    var user = await getUser(req.body);
    if (!user) return res
        .status(200)
        .json({ status: 400, message: "User not found!" });

    user.coins += coins;
    user.edit = true;
    try {
        await user.save();
    } catch (e) {
        console.log("an error occured! " + err);
        res.status(200).json({
            status: 400,
            message: "error while creating adding coins to user!",
            error: err,
        });
    }
    res.status(200).json({ status: 200, data: user, message: "add coins" });
});

router.post("/user", verify, async(req, res) => {
    try {
        const cUser = new User(req.body);
        const savedUser = await cUser.save();
        res.status(200).json({ status: 200, _id: savedUser._id, message: "created user" });
    } catch (err) {
        console.log("an error occured! " + err);
        res.status(200).json({
            status: 400,
            message: "error while creating new user!",
            error: err,
        });
    }
});

router.get("/user", verify, async(req, res) => {
    try {
        const users = await User.find({});
        res.status(200).json({ status: 200, _id: users._id, message: "fatched all users", data: users });
    } catch (err) {
        console.log("an error occured! " + err);
        res.status(200).json({
            status: 400,
            message: "error while fatching users!",
            error: err,
        });
    }
});

router.patch("/user", verify, async(req, res) => {
    const user = await getUser(req.body);
    if (!user)
        return res.status(200).json({ status: 400, message: "user does not exist" });

    try {
        const savedUser = await User.findOneAndUpdate({ _id: user._id }, req.body.data);
        res.status(200).json({ status: 200, _id: savedUser._id, message: "patched user" });
    } catch (err) {
        console.log("an error occured! " + err);
        res.status(200).json({
            status: 400,
            message: "error while patching user!",
            error: err,
        });
    }
});

router.delete("/user", verify, async(req, res) => {
    try {
        const savedUser = await User.remove({ _id: req.body._id });
        res.status(200).json({ status: 200, message: "removed" });
    } catch (err) {
        console.log("an error occured! " + err);
        res
            .status(200)
            .json({ status: 400, message: "error while deleting user!", error: err });
    }
});

router.post("/server", verify, async(req, res) => {
    try {
        const sServer = await getServer(req.body);
        if (sServer) {
            res.status(200).json({ status: 400, message: "This server already exists!" });
        }
    } catch (e) {
        res.status(200).json({ status: 400, message: "This server already exists!" });
    }

    try {
        const cServer = new DiscServer(req.body);
        const savedServer = await cServer.save();
        res.status(200).json({ status: 200, _id: savedServer._id, message: "created server" });
    } catch (err) {
        console.log("an error occured! " + err);
        res.status(200).json({
            status: 400,
            message: "error while creating new server!",
            error: err,
        });
    }
});

router.patch("/server", verify, async(req, res) => {
    const ser = await getServer(req.body);
    if (!ser)
        return res.status(200).json({ status: 400, message: "server does not exist" });
    try {
        const savedServer = await DiscServer.findOneAndUpdate({ _id: ser._id }, req.body.data);
        res.status(200).json({ status: 200, _id: savedServer._id, message: "patched server" });
    } catch (err) {
        console.log("an error occured! " + err);
        res.status(200).json({
            status: 400,
            message: "error while patching server!",
            error: err,
        });
    }
});

router.delete("/server", verify, async(req, res) => {
    try {
        const savedServer = await DiscServer.remove({ _id: req.body._id });
        res.status(200).json({ status: 200, message: "removed" });
    } catch (err) {
        console.log("an error occured! " + err);
        res
            .status(200)
            .json({ status: 400, message: "error while deleting server!", error: err });
    }
});

router.get("/job", verify, async(req, res) => {
    try {
        const jobs = await Job.find({});
        res.status(200).json({ status: 200, _id: jobs._id, message: "fatched all jobs", data: jobs });
    } catch (err) {
        console.log("an error occured! " + err);
        res.status(200).json({
            status: 400,
            message: "error while fatching jobs!",
            error: err,
        });
    }
});

router.post("/job", verify, async(req, res) => {
    try {
        const cJob = new Job(req.body);
        const savedJob = await cJob.save();
        res.status(200).json({ status: 200, _id: savedJob._id, message: "created job" });
    } catch (err) {
        console.log("an error occured! " + err);
        res.status(200).json({
            status: 400,
            message: "error while creating new job!",
            error: err,
        });
    }
});

router.patch("/job", verify, async(req, res) => {
    try {
        const savedJob = await Job.findOneAndUpdate({ _id: req.body._id }, req.body.data);
        res.status(200).json({ status: 200, _id: savedJob._id, message: "patched job" });
    } catch (err) {
        console.log("an error occured! " + err);
        res.status(200).json({
            status: 400,
            message: "error while patching job!",
            error: err,
        });
    }
});

router.delete("/job", verify, async(req, res) => {
    try {
        const savedJob = await Job.remove({ _id: req.body._id });
        res.status(200).json({ status: 200, message: "removed" });
    } catch (err) {
        console.log("an error occured! " + err);
        res
            .status(200)
            .json({ status: 400, message: "error while deleting job!", error: err });
    }
});

router.post("/monster", verify, async(req, res) => {
    try {
        const cMonster = new Monster(req.body);
        const savedMonster = await cMonster.save();
        res.status(200).json({ status: 200, _id: savedMonster._id, message: "created monster" });
    } catch (err) {
        console.log("an error occured! " + err);
        res.status(200).json({
            status: 400,
            message: "error while creating new monster!",
            error: err,
        });
    }
});

router.get("/monster", verify, async(req, res) => {
    try {
        const monsters = await Monster.find({});
        res.status(200).json({ status: 200, _id: monsters._id, message: "fatched all monsters", data: monsters });
    } catch (err) {
        console.log("an error occured! " + err);
        res.status(200).json({
            status: 400,
            message: "error while fatching monsters!",
            error: err,
        });
    }
});

router.patch("/monster", verify, async(req, res) => {
    try {
        const savedMonster = await Monster.findOneAndUpdate({ _id: req.body._id },
            req.body.data
        );
        res.status(200).json({ status: 200, _id: savedMonster._id, message: "patched monster" });
    } catch (err) {
        console.log("an error occured! " + err);
        res.status(200).json({
            status: 400,
            message: "error while patching new monster!",
            error: err,
        });
    }
});

router.delete("/monster", verify, async(req, res) => {
    try {
        const savedMonster = await Monster.remove({ _id: req.body._id });
        res.status(200).json({ status: 200, message: "removed" });
    } catch (err) {
        console.log("an error occured! " + err);
        res.status(200).json({
            status: 400,
            message: "error while deleting monster!",
            error: err,
        });
    }
});

router.get("/item", verify, async(req, res) => {
    try {
        const items = await Item.find({});
        res.status(200).json({ status: 200, _id: items._id, message: "fatched all items", data: items });
    } catch (err) {
        console.log("an error occured! " + err);
        res.status(200).json({
            status: 400,
            message: "error while fatching items!",
            error: err,
        });
    }
});

router.post("/item", verify, async(req, res) => {
    try {
        const cItem = new Item(req.body);
        const savedItem = await cItem.save();
        res.status(200).json({ status: 200, _id: savedItem._id, message: "created item" });
    } catch (err) {
        console.log("an error occured! " + err);
        res.status(200).json({
            status: 400,
            message: "error while creating new item!",
            error: err,
        });
    }
});

router.patch("/item", verify, async(req, res) => {
    try {
        const cItem = await Item.findOneAndUpdate({ _id: req.body._id }, req.body.data);
        res.status(200).json({ status: 200, _id: savedItem._id, message: "patched item" });
    } catch (err) {
        console.log("an error occured! " + err);
        res.status(200).json({
            status: 400,
            message: "error while patching item!",
            error: err,
        });
    }
});

router.delete("/item", verify, async(req, res) => {
    try {
        const cItem = await Item.remove({ _id: req.body._id });
        res.status(200).json({ status: 200, message: "removed" });
    } catch (err) {
        console.log("an error occured! " + err);
        res
            .status(200)
            .json({ status: 400, message: "error while deleting item!", error: err });
    }
});

router.post("/attack", verify, async(req, res) => {
    try {
        const cItem = new Attack(req.body);
        const savedAttack = await cItem.save();
        res.status(200).json({ status: 200, _id: savedAttack._id, message: "created attack" });
    } catch (err) {
        console.log("an error occured! " + err);
        res.status(200).json({
            status: 400,
            message: "error while creating new attack!",
            error: err,
        });
    }
});

router.get("/attack", verify, async(req, res) => {
    try {
        const attacks = await Attack.find({});
        res.status(200).json({ status: 200, _id: attacks._id, message: "fatched all attacks", data: attacks });
    } catch (err) {
        console.log("an error occured! " + err);
        res.status(200).json({
            status: 400,
            message: "error while fatching attacks!",
            error: err,
        });
    }
});

router.patch("/attack", verify, async(req, res) => {
    try {
        const cItem = await Attack.findOneAndUpdate({ _id: req.body._id }, req.body.data);
        res.status(200).json({ status: 200, _id: savedItem._id, message: "patched attack" });
    } catch (err) {
        console.log("an error occured! " + err);
        res.status(200).json({
            status: 400,
            message: "error while patching attack!",
            error: err,
        });
    }
});

router.delete("/attack", verify, async(req, res) => {
    try {
        const cItem = await Attack.remove({ _id: req.body._id });
        res.status(200).json({ status: 200, message: "removed" });
    } catch (err) {
        console.log("an error occured! " + err);
        res
            .status(200)
            .json({ status: 400, message: "error while deleting attack!", error: err });
    }
});

async function giveUserItem(amount, item, user) {

    //Test if storage place already exists
    var st = await ItemUserCon.findOne({ itemKY: item._id, userKY: user._id });
    if (st) {
        st.amount += amount;
        if (st.amount < 0)
            return res
                .status(200)
                .json({ status: 400, message: "Can't have negative amount of items" });

        if (st.amount == 0) {
            st.remove();
        }

        try {
            const storage = await st.save();
        } catch (err) {
            console.log("an error occured! " + err);
            res.status(200).json({
                status: 400,
                message: "error while creating new user!",
                error: err,
            });
        }
    } else {
        if (amount < 0)
            return res
                .status(200)
                .json({ status: 400, message: "Can't have negative amount of items" });

        if (amount == 0)
            return res
                .status(200)
                .json({ status: 400, message: "Zero items will not be saved!" });

        const storage = new ItemUserCon({
            item: item._id,
            user: user._id,
            amount: amount,
        });

        try {
            const savedItem = await storage.save();
            return savedItem;
        } catch (err) {
            console.log("an error occured! " + err);
            res.status(200).json({
                status: 400,
                message: "error while creating new user!",
                error: err,
            });
        }
    }
}

async function getRandomItem(minRarity) {
    var items = await Item.find();
    shuffle(items);
    for (let i = 0; i < items.length; i++) {
        if (stringToRarityInt(items[i].itemRarity) >= minRarity) {
            return items[i];
        }
    }
}

function calcDmg(attack, monster, monster1) {
    var baseDmg = attack.baseDmg;
    var lvl = monster.level;
    var stab = calcStab(monster, monster1);
    var efficiency = calcEfficiency(monster, monster1);
    var dmg = (((lvl * (1 / 3)) + 2) + baseDmg) * efficiency * stab;

    return dmg;
}

function calcStab(monster, monster1) {
    return 1;
}

function calcEfficiency(monster, monster1) {
    return 1;
}

async function getUserFromDID(did) {
    return await User.findOne({ userID: did });
}

async function getUserDidFromId(id) {
    return await User.findOne({ _id: id }).userID;
}

async function getServerFromDID(did) {
    return await DiscServer.findOne({ serverId: did });
}

async function getUser(body) {
    const s = body.id;
    const si = body._id;
    var user;

    if (s) user = await getUserFromDID(s);
    if (si) user = await User.findById(si);

    return user;
}

async function getServer(body) {
    const s = body.sid;
    const si = body.s_id;
    var server;

    if (s) server = await getServerFromDID(s);
    if (si) server = await DiscServer.findById(si);

    return server;
}

function makeToken(length) {
    var result = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#/&%§=?~*';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

function stringToRarityInt(strin) {
    switch (strin) {
        case "normal":
            return 0;

        case "epic":
            return 1;

        case "legendary":
            return 2;

        case "mystic":
            return 3;

        default:
            return 0;
    }
}

function shuffle(a) {
    var j, x, i;
    for (i = a.length - 1; i > 0; i--) {
        j = Math.floor(Math.random() * (i + 1));
        x = a[i];
        a[i] = a[j];
        a[j] = x;
    }
    return a;
}

function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

module.exports = router;