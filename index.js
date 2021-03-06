﻿var express = require('express');
var parameters = {
	// сообщение дня (приветствие)
	motd: 'Велкам ту май чат сервер!\nЛюдей онлайн: [online_count], а именно: [online];',
	// лимит сообщений на 10 секунд (человек может отправить и 3 сообщения за секунду, но не каждую) 
	messagerate: 17,
}

// создаем сервер
var WebSocketServer = require('ws').Server,
	wss = new WebSocketServer({port: 9000});

// соединение с БД
var MongoClient = require('mongodb').MongoClient,
	format = require('util').format;

var userListDB, chatDB;

// подсоединяемся к БД
MongoClient.connect('mongodb://127.0.0.1:27017', function (err, db) {
	if (err) {throw err}

	// записываем ссылки на таблицы (коллекции) в глобальные переменные
	userListDB = db.collection('users');
	chatDB = db.collection('chat');
});
// проверка пользователя на предмет существования в базе данных
function existUser (user, callback) {
	userListDB.find({login: user}).toArray(function (error, list) {
		callback (list.length !== 0);
	});
}
// эта функция отвечает целиком за всю систему аккаунтов
function checkUser (user, password, callback) {
	// проверяем, есть ли такой пользователь
	existUser(user, function (exist) {
		// если пользователь существует
		if (exist) {
			// то найдем в БД записи о нем
			userListDB.find({login: user}).toArray(function (error, list) {
				// проверяем пароль
				callback (list.pop().password === password);
			});
		} else {
			// если пользователя нет, то регистрируем его
			userListDB.insert ({login: user, password: password, color: get_random_color()}, {w:1}, function (err) {
				if (err) {throw err}
			});
			// не запрашиваем авторизацию, пускаем сразу
			callback (true);
		}
	});
}

var colors = {};

function colorOf (name, callback){
	if (name == '[server]') {
		callback('transparent');
		return;
	}
	if (!colors[name]) {
		userListDB.find({login: name}).toArray(function (error, list) {
			usr = list.pop();
			if (!usr.color) {
				color = get_random_color ()
				userListDB.update({ login: name }, {$set: {color: color}}, function () {});
			} else {
				color = usr.color;
			}
			colors[name] = color;
			callback (color);
		});
	} else {
		callback (colors[name]);
	}
}

function get_random_color() {
	var varters = '0123456789ABCDEF'.split('');
	var color = '#';
	for (var i = 0; i < 6; i++ ) {
		color += varters[Math.round(Math.random() * 15)];
	}
   	return color;
}
// функция отправки сообщения всем
function broadcast (by, message) {

	// запишем в переменную, чтоб не расходилось время
	var time = new Date().getTime();

	colorOf (by, function (color) {
		// отправляем по каждому соединению
		peers.forEach (function (ws) {
			try { // ассинхронность не всегда хороша
				ws.send (JSON.stringify ({
					type: 'message',
					message: message,
					from: by,
					time: time,
					color: color
				}));
			} catch (e) {}
		});

		if (by == '[server]') {
			return;
		}

		// сохраняем сообщение в истории
		chatDB.insert ({message: message, from: by, time: time, color: color}, {w:1}, function (err) {
			if (err) {throw err}
		});
	});
}

// цвета участников
var colors = [];
// список участников чата (их логины)
var lpeers = [];
var peers = [];
// функция отправки старых сообщений новому участнику чата
function sendNewMessages (ws, cb) {
	chatDB.find().sort({time:-1}).limit(50).toArray(function(error, entries) {
		if (error) {throw error;}
		entries = entries.reverse();
		entries.forEach(function (entry){
			entry.type = 'message';
			try {
				ws.send (JSON.stringify (entry));
			} catch (e) {}
		});
		cb();
	});
}

// убрать из массива элемент по его значению
// далеки следят за вами
Array.prototype.exterminate = function (value) {
	this.splice(this.indexOf(value), 1);
}

// при новом соединении
wss.on('connection', function (ws) {
	// проинициализируем переменные
	var login = '';
	var registered = false;

	// антифлуд
	var point = Date.now(); // точка отсчета 10 секунд
	var count = 0;

	// при входящем сообщении
	ws.on('message', function (message) {

		if (Date.now()-point>=10000){
			point = Date.now();
			count = 1;
		} else {
			if(++count>parameters.messagerate) {
				ws.send(JSON.stringify ({
					type: 'message',
					// напугали, тут всего-лиш кик.
					// некстати, это лучше не гуглить
					message: "Banned [FOREVER]", 
					from: '[server]',
					time: Date.now(),
					color: 'transparent'
				}));
				ws.close()
			}
		}

		// получаем событие в пригодном виде
		var event = JSON.parse(message);

		// если человек хочет авторизироваться, проверим его данные
		if (event.type === 'authorize') {
			// проверяем данные
			checkUser(event.user, event.password, function (success) {
				// чтоб было видно в другой области видимости
				registered = success;

				// подготовка ответного события
				var returning = {type:'authorize', success: success};

				// если успех, то
				if (success) {
					// добавим к ответному событию список людей онлайн
					returning.online = [].concat(lpeers); // костыль для копирования массива

					// добавим самого человека в список людей онлайн
					lpeers.push (event.user);

					// добавим ссылку на сокет в список соединений
					peers.push (ws);

					// чтобы было видно в другой области видимости
					login = event.user;

					broadcast('[server]', login+' присоединился к чату');

					//  если человек вышел
					ws.on ('close', function () {
						peers.exterminate(ws);
						lpeers.exterminate(login);
						broadcast('[server]', login+' вышел из чата');
					});
				}


				// ну и, наконец, отправим ответ
				try{ws.send (JSON.stringify(returning));}catch(e){}

				// отправим старые сообщения новому участнику
				if (success) {
					sendNewMessages(ws, function(){

						// и сообщение дня (приветствие)
						try{ws.send (JSON.stringify ({
							type: 'message',
							message: parameters.motd,
							from: '[server]',
							time: Date.now(),
							color: 'transparent'
						}));}catch(e){}
					});
				}
			});
		} else {
			// если человек не авторизирован, то игнорим его
			if (registered) {
				// проверяем тип события
				switch (event.type) {
					// если просто сообщение
					case 'message':
						// рассылаем его всем
						broadcast (login, event.message)
						break;
					// если сообщение о том, что он печатает сообщение
					case 'type':
						// то пока я не решил, что делать в таких ситуациях
						break;
				}
			}
		}
	});
});


var app = express();

app.set('port', (process.env.PORT || 5000));

app.use(express.static(__dirname + '/public'));

// views is directory for all template files
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

app.get('/', function(request, response) {
  response.render('pages/index');
});

app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});

