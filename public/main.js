function $(a){return document.getElementById(a)}

function specials_in (event) {
	var message = event.message;
	var moment = new Date(event.time);

		// получаем время в пригодном виде
		// не знаю зачем
	var time = (moment.getHours()<10)? '0'+moment.getHours() : moment.getHours();
		time = (moment.getMinutes()<10)? time+':0'+moment.getMinutes() : time+':'+moment.getMinutes();
		time = (moment.getSeconds()<10)? time+':0'+moment.getSeconds() : time+':'+moment.getSeconds();
	var date = (moment.getDate()<10)? '0'+moment.getDate() : moment.getDate();
		date = (moment.getMonth()<10)? date+'.0'+moment.getMinutes()+'.'+moment.getFullYear() : date+':'+moment.getMonth()+'.'+moment.getFullYear()

	message = message.replace(/\[online\]/gim, chatData.online.join(', ') || ' никто и ничто');
	message = message.replace(/\[online_count\]/gim, chatData.online.length);

	message = message.replace(/\[time\]/gim, time);
	message = message.replace(/\[date\]/gim, date);

	return message;
}

function specials_out(message) {
	// /me
	message = message.replace(/\s*\/me\s/, $('login').value+' ');

	return message;
}

var ws = new WebSocket ('ws://localhost:9000');
var chatData = {online:[]};

var notify = new Audio();
notify.src = './notify.mp3';

ws.onmessage = function (message) {
	// приводим ответ от сервера в пригодный вид
	var event = JSON.parse(message.data);

	// проверяем тип события и выбираем, что делать
	switch (event.type) {
		case 'message':
			// рендерим само сообщение

			var name = document.createElement('div');
			var icon = document.createElement('div');
			var body = document.createElement('div');
			var root = document.createElement('div');

			icon.style.backgroundColor = event.color;
			name.textContent = name.textContent = (event.from=='[server]')?'':event.from;
			body.textContent = body.textContent = specials_in(event);

			if (event.from == '[server]') {
				body.style.color = 'gray';
				body.style.fontFamily = 'Ubuntu Mono, Consolas, Monaco, monospace';
			}

			if (event.from != localStorage.getItem('chat_login')) {
				notify.pause();
				notify.currentTime = 0;
				notify.play();
			}

			root.appendChild(name);
			root.appendChild(icon);
			root.appendChild(body);

			$('messages').appendChild (root);
			break;
		case 'authorize':
			// ответ на запрос об авторизации
			if (event.success) {
				$('loginform').classList.remove('unauthorized');
				localStorage.setItem('chat_login', $('login').value);
				localStorage.setItem('chat_password', $('password').value);
				chatData.online = event.online;
			} else {
				$('password').classList.add('invalid');
				$('password').disabled = false;
				$('login').disabled = false;

				$('password').onblur = function () {
					this.classList.remove('invalid');
					this.onkeypress = null;
					this.onblur = null;
				}
				$('password').onkeypress = function () {
					this.classList.remove('invalid');
					this.onkeypress = null;
					this.onblur = null;
				}
			}
			break;
		default:
			// если сервер спятил, то даем об себе этом знать
			console.log ('unknown event:', event)
			break;
	}
}

// по нажатию Enter в поле ввода пароля
$('password').onkeydown = function (e) {
	if (e.which == 13) {
		// отправляем серверу событие authorize
		ws.send (JSON.stringify ({
			type: 'authorize',
			user: $('login').value,
			password: $('password').value
		}));

		$('password').disabled = true;
		$('login').disabled = true;

		return false;
	}
}
// по нажатию Enter в поле ввода текста
$('input').onkeydown = function (e) {
	// если человек нажал Ctrl+Enter или Shift+Enter, то просто создаем новую строку.
	if (e.which == 13 && !e.ctrlKey && !e.shiftKey) {

		if (($('input').textContent||$('input').textContent).split('\n').join('').length == 0) {
			return false;
		}

		// отправляем серверу событие message
		ws.send (JSON.stringify ({
			type: 'message',
			message: specials_out(($('input').textContent||$('input').textContent))
		}));
		$('input').textContent = ''; // чистим поле ввода
		$('input').textContent = '';
	}
}

$('start').onclick = function () {
	// отправляем серверу событие authorize
	ws.send (JSON.stringify ({
		type: 'authorize',
		user: $('login').value,
		password: $('password').value
	}));
	$('password').disabled = true;
	$('login').disabled = true;
}

// скроллим вниз при новом сообщении
var observer = new MutationObserver(function(mutations) {
	mutations.forEach(function(mutation) {
		var objDiv = $('messages');
		objDiv.scrollTop = objDiv.scrollHeight;
	});
}).observe($('messages'), { childList: true });

if (localStorage.chat_login) {
	$('login').value = localStorage.getItem('chat_login');
	$('password').value = localStorage.getItem('chat_password');

	ws.onopen = function () {
		ws.send (JSON.stringify ({
			type: 'authorize',
			user: $('login').value,
			password: $('password').value
		}));
	}

	$('password').disabled = true;
	$('login').disabled = true;
}