const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcrypt');

// Middleware
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 2 * 60 * 60 * 1000 } // 2 hours
}));

// Set EJS as template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

const generalModel = require("./models/general-public")
const officialModel = require("./models/officials")
const postModel = require('./models/post');
const dbConnection = require("./config/db");
const dataModel = require('./models/dataModel');

// Mock data for demonstration
const mockData = {
  stats: {
    totalCases: 847,
    activeAlerts: 23,
    waterSources: 156,
    riskLevel: 'Medium'
  },
  alerts: [
    {
      id: 1,
      type: 'outbreak',
      severity: 'high',
      title: 'Cholera Outbreak Detected',
      location: 'Guwahati East District',
      affectedCount: 23,
      time: '2 hours ago',
      status: 'active'
    },
    {
      id: 2,
      type: 'water',
      severity: 'medium',
      title: 'Water Quality Alert',
      location: 'Silchar Community Well',
      affectedCount: 0,
      time: '5 hours ago',
      status: 'investigating'
    },
    {
      id: 3,
      type: 'prediction',
      severity: 'low',
      title: 'Predicted Outbreak Risk',
      location: 'Dibrugarh Region',
      affectedCount: 0,
      time: '1 day ago',
      status: 'monitoring'
    }
  ],
  waterSensors: [
    {
      id: '1',
      location: 'Village Well A',
      pH: 7.2,
      turbidity: 3.1,
      bacterial: 'safe',
      lastUpdated: new Date().toLocaleString(),
      status: 'online'
    },
    {
      id: '2',
      location: 'River Point B',
      pH: 6.8,
      turbidity: 8.5,
      bacterial: 'moderate',
      lastUpdated: new Date().toLocaleString(),
      status: 'online'
    },
    {
      id: '3',
      location: 'Community Pond C',
      pH: 6.2,
      turbidity: 15.2,
      bacterial: 'high',
      lastUpdated: new Date().toLocaleString(),
      status: 'offline'
    }
  ]
};
app.use((req, res, next) => {
  res.locals.language = req.query.lang || 'en';
  res.locals.user = req.session.user || null;
  next();
});
// Auth helpers
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.session.user || !roles.includes(req.session.user.role)) {
      return res.redirect('/dashboard');
    }
    next();
  };
}

// Routes
app.get('/', (req, res) => {
  const language = req.query.lang || 'en';
  res.render('landing', { layout: false, activeTab: 'landing' });
});

app.get('/dashboard', requireLogin, async (req, res) => {
  try {
    const language = req.query.lang || 'en';

    // Compute total cases from Disease_Data
    const agg = await dataModel.aggregate([
      {
        $group: {
          _id: null,
          totalCases: { $sum: { $ifNull: ["$Cases", 0] } }
        }
      }
    ]);
    const totalCases = (agg && agg[0] && agg[0].totalCases) ? agg[0].totalCases : 0;

    const stats = { ...mockData.stats, totalCases };

    res.render('dashboard', {
      title: 'Dashboard',
      language,
      stats,
      alerts: mockData.alerts,
      activeTab: 'dashboard'
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    // Fallback to mockData if DB fails
    const language = req.query.lang || 'en';
    res.render('dashboard', {
      title: 'Dashboard',
      language,
      stats: mockData.stats,
      alerts: mockData.alerts,
      activeTab: 'dashboard'
    });
  }
});

app.get('/report', requireLogin, requireRole(['general']), (req, res) => {
  const language = req.query.lang || 'en';
  res.render('report', {
    title: 'Community Report',
    language,
    activeTab: 'report'
  });
});

app.post('/report', requireLogin, requireRole(['general']), async (req, res) => {
  const language = req.query.lang || 'en';
  // Process the report data here
  // console.log(req.body);
  const { title, region, body, symptoms, type, waterSource, affectedCount } = req.body

  const post = new postModel({
    title: title,
    region: region,
    body: body,
    symptoms: symptoms,
    type: type,
    waterSource: waterSource,
    affectedCount: affectedCount
  })

  await post.save()

  res.render('report', {
    title: 'Community Report',
    language,
    activeTab: 'report',
    success: true,
    message: 'Report submitted successfully! Health officials have been notified.'
  });
});

app.get('/water-quality', requireLogin, requireRole(['official']), (req, res) => {
  const language = req.query.lang || 'en';
  res.render('water-quality', {
    title: 'Water Quality',
    language,
    sensors: mockData.waterSensors,
    activeTab: 'water'
  });
});

app.get('/education', requireLogin, requireRole(['general']), (req, res) => {
  const language = req.query.lang || 'en';
  const module = req.query.module || 'hygiene';
  res.render('education', {
    title: 'Education',
    language,
    activeModule: module,
    activeTab: 'education'
  });
});

// API endpoints for AJAX requests
app.get('/api/alerts', (req, res) => {
  res.json(mockData.alerts);
});

app.get('/api/stats', (req, res) => {
  res.json(mockData.stats);
});

app.get('/api/water-sensors', (req, res) => {
  res.json(mockData.waterSensors);
});

// Disease data APIs
app.get('/api/disease/months', async (req, res) => {
  try {
    const months = await dataModel.distinct('mon');
    const sorted = (months || []).filter(m => m != null).sort((a, b) => a - b);
    const latestMonth = sorted.length ? sorted[sorted.length - 1] : null;
    res.json({ months: sorted, latestMonth });
  } catch (err) {
    console.error('months api error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.get('/api/disease/hotspots', async (req, res) => {
  try {
    let mon = req.query.mon ? Number(req.query.mon) : null;
    const year = req.query.year ? Number(req.query.year) : null;

    const match = {};
    if (year) match.year = year;
    if (mon) {
      match.mon = mon;
    } else {
      // default to latest month available if none provided
      const months = await dataModel.distinct('mon');
      const sorted = (months || []).filter(m => m != null).sort((a, b) => a - b);
      mon = sorted.length ? sorted[sorted.length - 1] : null;
      if (mon) match.mon = mon;
    }

    const docs = await dataModel.find(match, {
      state_ut: 1,
      district: 1,
      Disease: 1,
      Cases: 1,
      Latitude: 1,
      Longitude: 1,
      _id: 0
    }).lean();

    const hotspots = (docs || [])
      .filter(d => typeof d.Latitude === 'number' && typeof d.Longitude === 'number')
      .map(d => ({
        state_ut: d.state_ut || '',
        district: d.district || '',
        Disease: d.Disease || '',
        Cases: Number(d.Cases || 0),
        lat: d.Latitude,
        lon: d.Longitude
      }));

    res.json({ month: mon, year: match.year || null, hotspots });
  } catch (err) {
    console.error('hotspots api error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.get('/api/disease/trends', async (req, res) => {
  try {
    // If year is provided, filter by that year; otherwise aggregate across all years
    const year = req.query.year ? Number(req.query.year) : null;

    const pipeline = [];
    if (year) pipeline.push({ $match: { year } });
    pipeline.push({ $group: { _id: '$mon', total: { $sum: { $ifNull: ['$Cases', 0] } } } });

    const result = await dataModel.aggregate(pipeline);
    const totalsByMonth = new Map(result.map(r => [Number(r._id), r.total]));
    const monthly = Array.from({ length: 12 }, (_, i) => ({ mon: i + 1, total: totalsByMonth.get(i + 1) || 0 }));

    res.json({ year, monthly });
  } catch (err) {
    console.error('trends api error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.get('/api/disease/summary', async (req, res) => {
  try {
    const agg = await dataModel.aggregate([
      {
        $group: {
          _id: null,
          totalCases: { $sum: { $ifNull: ['$Cases', 0] } },
          totalDeaths: { $sum: { $ifNull: ['$Deaths', 0] } },
          minYear: { $min: '$year' },
          maxYear: { $max: '$year' }
        }
      }
    ]);

    const { totalCases = 0, totalDeaths = 0, minYear = null, maxYear = null } = agg[0] || {};
    const months = await dataModel.distinct('mon');
    const sortedMonths = (months || []).filter(m => m != null).sort((a, b) => a - b);

    res.json({ totalCases, totalDeaths, yearRange: { min: minYear, max: maxYear }, months: sortedMonths });
  } catch (err) {
    console.error('summary api error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.get('/login', (req, res) => {
  res.render('login', { layout: false, activeTab: "login" })
})

app.get('/signup', (req, res) => {
  res.render('signup', { layout: false, activeTab: "login" })
})

app.post('/signup', async (req, res) => {
  try {
    const { userType } = req.body;
    const saltRounds = 10;

    if (userType === 'public') {
      const {
        fullName, mobile, email, state, district, village,
        password
      } = req.body;

      // Check existing (by email if provided)
      if (email) {
        const existing = await generalModel.findOne({ userEmail: email });
        if (existing) {
          return res.status(409).send('Account already exists with this email');
        }
      }

      const hashed = await bcrypt.hash(password, saltRounds);
      const doc = new generalModel({
        name: fullName,
        phoneNo: mobile ? Number(mobile) : undefined,
        userEmail: email || undefined,
        state,
        district,
        Area: village,
        password: hashed
      });
      await doc.save();
      return res.redirect('/login');
    }

    // official signup
    const {
      fullName, email, designation, state, district, department,
      employeeId, mobile, password
    } = req.body;

    // Check existing by email or employee id
    const existingOff = await officialModel.findOne({
      $or: [
        { userEmail: email },
        { id: employeeId ? Number(employeeId) : -1 }
      ]
    });
    if (existingOff) {
      return res.status(409).send('Official account already exists (email/employee id)');
    }

    const hashed = await bcrypt.hash(password, saltRounds);
    const doc = new officialModel({
      name: fullName,
      userEmail: email,
      designation,
      state,
      district,
      department,
      id: employeeId ? Number(employeeId) : undefined,
      phone: mobile ? Number(mobile) : undefined,
      password: hashed
    });
    await doc.save();
    return res.redirect('/login');
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).send('Internal server error');
  }
});

app.get('/outbreak-prediction', requireLogin, async (req, res) => {
  const language = req.query.lang || 'en';

  // Execute Python script to compute redzones and generate map
  const { spawn } = require('child_process');
  const py = spawn('python3', ['test.py'], {
    cwd: __dirname,
    env: { ...process.env, MONGO_URI: process.env.MONGO_URI || '' }
  });

  let stdout = '';
  let stderr = '';

  await new Promise((resolve) => {
    py.stdout.on('data', (data) => { stdout += data.toString(); });
    py.stderr.on('data', (data) => { stderr += data.toString(); });
    py.on('close', () => resolve());
  });

  if (stderr) {
    console.error('Python stderr:', stderr);
  }

  let payload = { redzones: [], mapPath: null };
  try {
    if (stdout && stdout.trim().startsWith('{')) {
      payload = JSON.parse(stdout.trim());
    }
  } catch (e) {
    console.error('Failed to parse python output', e);
  }

  res.render('outbreak-prediction', {
    title: 'Outbreak Prediction',
    language,
    activeTab: 'prediction',
    alerts: mockData.alerts,
    redzones: payload.redzones || [],
    mapPath: payload.mapPath || null
  });
});

app.get('/community-post', requireLogin, requireRole(['official']), async (req, res) => {
  const language = req.query.lang || 'en';

  const allPosts = await postModel.find().lean();
  // console.log(allPosts[0].title)
  res.render('community-post', {
    title: 'Community Post',
    language,
    activeTab: 'community-post',
    thePosts: allPosts,
  });
});

app.post('/login', async (req, res) => {
  try {
    const type = req.body.type || req.body.role || 'public';

    if (type === 'official') {
      const email = req.body.officialEmail;
      const employeeId = req.body.officialEmployeeId;
      const password = req.body.password;

      const user = await officialModel.findOne({ userEmail: email });
      if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });
      if (employeeId && String(user.id || '') !== String(employeeId)) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }
      const ok = await bcrypt.compare(password, user.password || '');
      if (!ok) return res.status(401).json({ success: false, message: 'Invalid credentials' });

      req.session.user = { role: 'official', email: user.userEmail, employeeId: user.id };
      return res.json({ success: true, redirect: '/dashboard' });
    } else {
      const email = req.body.publicEmail;
      const password = req.body.password;

      const user = await generalModel.findOne({ userEmail: email });
      if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });
      const ok = await bcrypt.compare(password, user.password || '');
      if (!ok) return res.status(401).json({ success: false, message: 'Invalid credentials' });

      req.session.user = { role: 'general', email: user.userEmail };
      return res.json({ success: true, redirect: '/dashboard' });
    }
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Smart Health Surveillance System running on port ${PORT}`);
  console.log(`Visit: http://localhost:${PORT}`);
});