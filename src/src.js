'use strict'

const horizon = 100,
	camPos = [0, 12, 9],
	idMat = new Float32Array([
		1, 0, 0, 0,
		0, 1, 0, 0,
		0, 0, 1, 0,
		0, 0, 0, 1]),
	projMat = new Float32Array(16),
	viewMat = new Float32Array(16),
	modelViewMat = new Float32Array(16),
	spriteMat = new Float32Array(16),
	groundMat = new Float32Array(16),
	cacheMat = new Float32Array(16),
	mapSize = 128,
	mapRadius = mapSize >> 1,
	map = new Uint8Array(mapSize * mapSize),
	groundSize = 35,
	groundRadius = groundSize >> 1,
	spriteSizes = [],
	screen = [],
	pointerSpot = [0, 0, 0],
	pointersX = [],
	pointersY = [],
	compareDist = (a, b) => b.dist - a.dist,
	camera = {x: 0, z: 0},
	objects = [
		{sprite: 0, x: 0, y: 0, z: 0, tx: 0, tz: 0,
			last: 0, frame: 0, update: updatePlayer,
			getEaten: function() {
				this.update = function() {
					pickSprite(this, 1, 2)
				}
				items.length = 0
				updateInventory()
				say('Ouch!')
			},
			resurrect: function() {
				this.update = null
				setTimeout(function() {
					say('You got printed anew.')
					player.x = player.z = player.tx = player.tz = 0
					player.update = updatePlayer
				}, 2000)
			}
		},
		{sprite: 3, x: 5, y: 0, z: -4, tx: -5, tz: -4,
				lx: 0, lz: 0, stuck: 0, ignore: 0,
				last: 0, frame: 0, speed: .06, sight: 16,
				update: updatePredator,
				waypoint: function() {
			this.tx = this.tx > 0 ? -5 : 5
			this.tz = -4
		}},
		{sprite: 3, x: 10, y: 0, z: 10, tx: 10, tz: 10,
				lx: 0, lz: 0, stuck: 0, ignore: 0,
				last: 0, frame: 0, speed: .06, sight: 16, a: 0,
				update: updatePredator,
				waypoint: function() {
			this.tx = Math.cos(this.a) * 6
			this.tz = 10 + Math.sin(this.a) * 6
			this.a += .5
		}},
	],
	player = objects[0]

let seed = 1,
	message,
	inventory,
	gl,
	spriteModelBuffer,
	spriteUvBuffer,
	groundModelBuffer,
	groundUvBuffer,
	groundUvs,
	groundLength,
	atlasCoords,
	vertexLoc,
	uvLoc,
	projMatLoc,
	modelViewMatLoc,
	camX, camA,
	camY, camB,
	camZ, camC,
	lookX,
	lookZ,
	pointers,
	pickables = [],
	items = [],
	now

function say(what) {
	message.style.display = 'inline-block'
	message.innerHTML = what
	setTimeout(function() {
		message.style.display = 'none'
	}, 1000 + 200 * what.split(' ').length)
}

function moveToTarget(o, tx, tz, step) {
	const dx = tx - o.x,
		dz = tz - o.z,
		d = Math.sqrt(dx*dx + dz*dz),
		f = Math.min(1, step / d),
		x = o.x + dx * f,
		z = o.z + dz * f
	if (o != camera && map[(mapRadius + Math.round(z / 2)) * mapSize +
			(mapRadius + Math.round(x / 2))] & 128) {
		o.tx = o.x
		o.tz = o.z
		return 1
	}
	o.x = x
	o.z = z
	return f == 1
}

function pickSprite(o, idle, frames) {
	o.sprite = idle + o.frame % frames
}

function pickDirSprite(o, idle, frames, tx, tz) {
	// To check whether (tx, tz) is left or right (on the screen)
	// from the camera/player vector (x - camX, z - camZ), we can
	// use the perpendicular vector (z - camZ, camX - x) which is
	// always pointing in the same relative direction. Calculating
	// the dot product with the vector (tx - x, tz - z) tells us
	// if it has the same general direction (> 0).
	const dir = (o.z - camZ)*(tx - o.x) + (camX - o.x)*(tz - o.z)
	if (dir == 0) {
		o.sprite = idle
		o.dir = 1
		return
	}
	o.sprite = idle + 1 + o.frame % frames
	o.dir = dir < 0 ? -1 : 1
}

function dropItem() {
	const a = player.dropAngle
	this.x = player.x + Math.cos(a) / 2
	this.z = player.z + Math.sin(a) / 2
	player.dropAngle = a + 1
	pickables.push(this)
	items = items.filter(item => item != this)
	updateInventory()
}

function updateInventory() {
	if (items.length == 0) {
		inventory.style.display = 'none'
		return
	}
	inventory.style.display = 'block'
	inventory.innerHTML = ''
	items.forEach(o => {
		const e = document.createElement('span')
		e.onclick = function() { o.use() }
		e.innerHTML = `<svg viewBox="0 0 100 100" class="Itm">${
			o.icon.innerHTML}</svg>`
		inventory.appendChild(e)
	})
}

function updatePlayer() {
	if (pointers > 0) {
		moveToPointer()
		this.dropAngle = 0
	}
	pickDirSprite(this, 0, 2, this.tx, this.tz)
	moveToTarget(this, this.tx, this.tz, .09)
	for (let i = 0, l = pickables.length; i < l; ++i) {
		const o = pickables[i],
			dx = o.x - this.x,
			dz = o.z - this.z,
			d = dx*dx + dz*dz
		if (d < .2) {
			o.x = 100000
			items.push(o)
			updateInventory()
			pickables = pickables.filter(p => o != p)
			say(`Picked up ${o.name}`)
			break
		}
	}
	// Make camera follow player with a slight delay.
	const dx = lookX - this.x,
		dz = lookZ - this.z,
		d = dx*dx + dz*dz
	if (d > 0) {
		const dd = Math.sqrt(d) - 2
		moveToTarget(camera, this.tx, this.tz, dd > .01 ? dd : .06)
		lookAt(camera.x, camera.z)
	}
}

function eat(prey) {
	if (!prey.eaten) {
		prey.eaten = 1
		prey.killed = now
		prey.getEaten && prey.getEaten()
	} else if (now - prey.killed > 1000) {
		pickables = pickables.filter(o => o != prey)
		prey.x = 100000
		prey.eaten = 0
		prey.resurrect && prey.resurrect()
		return 1
	}
	return 0
}

function hunt(o, prey, d) {
	if (d < .2) {
		// Eat it!
		pickSprite(o, 4, 2)
		eat(prey)
		return
	} else if (d < o.sight && o.ignore < 1) {
		// Move towards prey.
		pickDirSprite(o, 3, 2, prey.x, prey.z)
		moveToTarget(o, prey.x, prey.z, o.speed)
	} else {
		// Nothing in sight. Walk along.
		pickDirSprite(o, 3, 2, o.tx, o.tz)
		if (moveToTarget(o, o.tx, o.tz, o.speed)) {
			o.waypoint()
		}
		--o.ignore
	}
	// Detect if we're stuck and if so go to some random spot.
	if (o.x == o.lx && o.z == o.lz &&
			++o.stuck > 3) {
		o.tx = o.x + random() * 4 - 2
		o.tz = o.z + random() * 4 - 2
		o.ignore = 10
		o.stuck = 0
	}
	o.lx = o.x
	o.lz = o.z
}

function updatePredator() {
	let prey, closest = 100000, sight = this.sight
	for (let i = 0, l = pickables.length; i < l; ++i) {
		const o = pickables[i],
			dx = o.x - this.x,
			dz = o.z - this.z,
			d = dx*dx + dz*dz
		if (d < sight) {
			closest = d
			prey = o
			break
		}
	}
	const dx = player.x - this.x,
		dz = player.z - this.z,
		d = dx*dx + dz*dz
	if (d < sight && d < closest) {
		prey = player
		closest = d
	}
	hunt(this, prey, closest)
}

function run() {
	requestAnimationFrame(run)
	now = Date.now()

	// Draw ground.
	gl.bindBuffer(gl.ARRAY_BUFFER, groundModelBuffer)
	gl.vertexAttribPointer(vertexLoc, 3, gl.FLOAT, 0, 0, 0)
	gl.bindBuffer(gl.ARRAY_BUFFER, groundUvBuffer)
	gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, 0, 0, 0)

	const mx = lookX >> 1, mz = lookZ >> 1
	updateGroundUvs(mx, mz)
	gl.bufferData(gl.ARRAY_BUFFER, groundUvs, gl.DYNAMIC_DRAW)

	cacheMat.set(idMat)
	cacheMat[12] = mx << 1
	cacheMat[14] = mz << 1
	multiply(modelViewMat, viewMat, cacheMat)
	gl.uniformMatrix4fv(modelViewMatLoc, 0, modelViewMat)
	gl.drawArrays(gl.TRIANGLES, 0, groundLength)

	// Draw sprites.
	gl.bindBuffer(gl.ARRAY_BUFFER, spriteModelBuffer)
	gl.vertexAttribPointer(vertexLoc, 3, gl.FLOAT, 0, 0, 0)
	gl.bindBuffer(gl.ARRAY_BUFFER, spriteUvBuffer)

	// Some update()'s may change camera position so this needs to run
	// in its own loop before everything else.
	objects.forEach(o => {
		if (o.update) {
			if (now - o.last > 200) {
				++o.frame
				o.last = now
			}
			o.update()
		}
	})
	objects.forEach(o => {
		// Less operations to calculate the distance from the view plane
		// than it is to multiply the matrices.
		// https://en.wikipedia.org/wiki/Distance_from_a_point_to_a_plane
		const dx = camX - o.x,
			dy = camY - o.y,
			dz = camZ - o.z,
			d = camA*dx + camB*dy + camC*dz,
			x = camA*d,
			y = camB*d,
			z = camC*d
		o.dist = x*x + y*y + z*z
	})
	objects.sort(compareDist).forEach(o => {
		const n = o.sprite, size = spriteSizes[n]
		scale(cacheMat, spriteMat, size[0] * o.dir, size[1], 1)
		cacheMat[12] = o.x
		cacheMat[13] = o.y
		cacheMat[14] = o.z
		gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, 0, 0, n << 5)
		multiply(modelViewMat, viewMat, cacheMat)
		gl.uniformMatrix4fv(modelViewMatLoc, 0, modelViewMat)
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
	})
}

function rayGround(out, lx, ly, lz, dx, dy, dz) {
	const denom = -1 * dy
	if (denom > .0001) {
		const t = -1 * -ly / denom
		out[0] = lx + dx * t
		out[1] = ly + dy * t
		out[2] = lz + dz * t
		return t >= 0
	}
	return 0
}

function getGroundSpot(out, nx, ny) {
	invert(cacheMat, projMat)
	const cx = cacheMat[0]*nx + cacheMat[4]*ny + -cacheMat[8] + cacheMat[12],
		cy = cacheMat[1]*nx + cacheMat[5]*ny + -cacheMat[9] + cacheMat[13]
	invert(cacheMat, viewMat)
	let x = cacheMat[0]*cx + cacheMat[4]*cy + -cacheMat[8],
		y = cacheMat[1]*cx + cacheMat[5]*cy + -cacheMat[9],
		z = cacheMat[2]*cx + cacheMat[6]*cy + -cacheMat[10],
		len = x*x + y*y + z*z
	if (len > 0) {
		len = 1 / Math.sqrt(len)
	}
	x *= len
	y *= len
	z *= len
	return rayGround(out, cacheMat[12], cacheMat[13], cacheMat[14], x, y, z)
}

function moveToPointer() {
	if (getGroundSpot(pointerSpot, pointersX[0], pointersY[0])) {
		player.tx = pointerSpot[0]
		player.tz = pointerSpot[2]
	}
}

function setPointer(event, down) {
	const touches = event.touches
	if (touches) {
		pointers = touches.length
		for (let i = pointers; i--;) {
			const t = touches[i]
			pointersX[i] = t.pageX
			pointersY[i] = t.pageY
		}
	} else if (!down) {
		pointers = 0
	} else {
		pointers = 1
		pointersX[0] = event.pageX
		pointersY[0] = event.pageY
	}

	// Map to WebGL coordinates.
	for (let i = pointers; i--;) {
		pointersX[i] = (2 * pointersX[i]) / screen[0] - 1
		pointersY[i] = 1 - (2 * pointersY[i]) / screen[1]
	}

	event.stopPropagation()
}

function pointerCancel(event) {
	setPointer(event, 0)
}

function pointerUp(event) {
	setPointer(event, 0)
}

function pointerMove(event) {
	setPointer(event, pointers)
}

function pointerDown(event) {
	setPointer(event, 1)
}

function lookAt(x, z) {
	lookX = x
	lookZ = z

	translate(viewMat, idMat, x, 0, z)
	rotate(viewMat, viewMat, .2, 0, 1, 0)
	translate(viewMat, viewMat, camPos[0], camPos[1], camPos[2])
	rotate(viewMat, viewMat, -.9, 1, 0, 0)

	// Normalized vector of the view direction.
	camA = viewMat[8]
	camB = viewMat[9]
	camC = viewMat[10]
	// View origin.
	camX = viewMat[12]
	camY = viewMat[13]
	camZ = viewMat[14]

	spriteMat.set(viewMat)

	invert(viewMat, viewMat)
}

function resize() {
	gl.canvas.width = screen[0] = gl.canvas.clientWidth
	gl.canvas.height = screen[1] = gl.canvas.clientHeight
	gl.viewport(0, 0, screen[0], screen[1])
	setPerspective(projMat, Math.PI * .125, screen[0] / screen[1], .1, horizon)
	gl.uniformMatrix4fv(projMatLoc, gl.FALSE, projMat)
}

function compileShader(type, src) {
	const id = gl.createShader(type)
	gl.shaderSource(id, src)
	gl.compileShader(id)
	return id
}

function createProgram(vs, fs) {
	const id = gl.createProgram()
	gl.attachShader(id, compileShader(gl.VERTEX_SHADER, vs))
	gl.attachShader(id, compileShader(gl.FRAGMENT_SHADER, fs))
	gl.linkProgram(id)
	if (!gl.getProgramParameter(id, gl.LINK_STATUS)) {
		throw gl.getProgramInfoLog(id)
	}
	return id
}

function updateGroundUvs(x, z) {
	const skip = mapSize - groundSize
	for (let t = 0, o = (mapRadius + z - groundRadius) * mapSize +
			(mapRadius + x - groundRadius), i = 0;
			t < groundSize; ++t, o += skip) {
		for (let s = 0; s < groundSize; ++s, ++o) {
			const offset = (map[o] & 127) << 3,
				left = atlasCoords[offset],
				top = atlasCoords[offset + 1],
				right = atlasCoords[offset + 6],
				bottom = atlasCoords[offset + 7]
			// A--B
			// | /
			// |/
			// C
			groundUvs[i++] = left
			groundUvs[i++] = top
			groundUvs[i++] = right
			groundUvs[i++] = top
			groundUvs[i++] = left
			groundUvs[i++] = bottom
			//    E
			//   /|
			//  / |
			// D--F
			groundUvs[i++] = left
			groundUvs[i++] = bottom
			groundUvs[i++] = right
			groundUvs[i++] = top
			groundUvs[i++] = right
			groundUvs[i++] = bottom
		}
	}
}

function createGroundModel() {
	const vertices = []
	for (let y = -groundRadius; y <= groundRadius; ++y) {
		for (let x = -groundRadius; x <= groundRadius; ++x) {
			const xx = x * 2, yy = y * 2
			vertices.push(
				// A--B
				// | /
				// |/
				// C
				xx - 1, 0, yy - 1,
				xx + 1, 0, yy - 1,
				xx - 1, 0, yy + 1,
				//    E
				//   /|
				//  / |
				// D--F
				xx - 1, 0, yy + 1,
				xx + 1, 0, yy - 1,
				xx + 1, 0, yy + 1,
			)
		}
	}
	return vertices
}

function createBuffer(data, usage) {
	const id = gl.createBuffer()
	gl.bindBuffer(gl.ARRAY_BUFFER, id)
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data),
		usage || gl.STATIC_DRAW)
	return id
}

function createTexture(image) {
	const id = gl.createTexture()
	gl.bindTexture(gl.TEXTURE_2D, id)
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
	gl.generateMipmap(gl.TEXTURE_2D)
	return id
}

function createMap() {
	for (let i = 0, l = mapSize * mapSize; i < l; ++i) {
		map[i] = 8 + random() * 3 | 0
	}

	const innerRadius = (mapRadius - groundRadius) * 2,
		ofs = (x, z) => (mapRadius + Math.round(z / 2)) * mapSize +
			(mapRadius + Math.round(x / 2))

	map[ofs(4, 0)] = 11
	objects.push({
		sprite: 14, x: 4, y: 0, z: 0,
		last: 0, frame: 0,
		update: function() {
			const dx = player.x - this.x,
				dz = player.z - this.z,
				d = dx*dx + dz*dz
			if (d < 2) {
				pickDirSprite(this, 14, 2, player.x, player.z)
				if (eat(player)) {
					this.sprite = 14
				}
			}
		},
	})

	// Add fauna objects.
	for (let i = 300; i > 0;) {
		const x = -innerRadius + (random() * (innerRadius * 2)) | 0,
			z = -innerRadius + (random() * (innerRadius * 2)) | 0
		if (x*x + z*z > 2 &&
				!(map[ofs(x, z)] & 128)) {
			objects.push({sprite: 6 + random() * 2 | 0, x: x, y: 0, z: z})
			--i
		}
	}

	// Add pickables.
	for (let i = 50; i > 0;) {
		const x = -innerRadius + (random() * (innerRadius * 2)) | 0,
			z = -innerRadius + (random() * (innerRadius * 2)) | 0
		if (x*x + z*z > 2 &&
				!(map[ofs(x, z)] & 128)) {
			const sprite = 12 + random() * 2 | 0, o = {
				sprite: sprite,
				x: x, y: 0, z: z,
				name: sprite == 12 ? 'Egg' : 'Flower',
				use: dropItem,
			}
			objects.push(o)
			pickables.push(o)
			--i
		}
	}
}

function init(atlas) {
	lookAt(0, 0)
	createMap()

	// Load inventory icons.
	objects.forEach(o => {
		if (o.name) {
			o.icon = document.getElementById(o.name)
		}
		o.dir = 1
	})

	message = document.getElementById('M')
	inventory = document.getElementById('I')

	const canvas = document.getElementById('C')
	gl = canvas.getContext('webgl')
	gl.enable(gl.BLEND)
	gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
	gl.enable(gl.DEPTH_TEST)
	// The sprites have transparent areas and so they still need be to
	// drawn when they share the same depth value with a another sprite
	// or one of them will be skipped when it would be visible through
	// the transparent area.
	gl.depthFunc(gl.LEQUAL)
	gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1)

	const atlasTexture = createTexture(atlas.canvas),
		groundVertices = createGroundModel()
	atlasCoords = atlas.coords
	groundLength = groundVertices.length / 3
	groundModelBuffer = createBuffer(groundVertices)
	groundUvBuffer = gl.createBuffer()
	groundUvs = new Float32Array(groundLength * 2)

	spriteModelBuffer = createBuffer([
		// A--C
		// | /|
		// |/ |
		// B--D
		-.5, 1, 0,
		-.5, 0, 0,
		.5, 1, 0,
		.5, 0, 0,
	])
	spriteUvBuffer = createBuffer(atlas.coords)

	const program = createProgram(
			document.getElementById('VertexShader').textContent,
			document.getElementById('FragmentShader').textContent),
		atlasTextureLoc = gl.getUniformLocation(program, 'texture')
	gl.enableVertexAttribArray(
		vertexLoc = gl.getAttribLocation(program, "vertex"))
	gl.enableVertexAttribArray(
		uvLoc = gl.getAttribLocation(program, "uv"))
	projMatLoc = gl.getUniformLocation(program, 'projMat')
	modelViewMatLoc = gl.getUniformLocation(program, 'modelViewMat')

	gl.useProgram(program)

	gl.activeTexture(gl.TEXTURE0)
	gl.bindTexture(gl.TEXTURE_2D, atlasTexture)
	gl.uniform1i(atlasTextureLoc, 0)

	window.onresize = resize
	resize()

	canvas.onmousedown = pointerDown
	canvas.onmousemove = pointerMove
	canvas.onmouseup = pointerUp
	canvas.onmouseout = pointerCancel

	canvas.ontouchstart = pointerDown
	canvas.ontouchmove = pointerMove
	canvas.ontouchend = pointerUp
	canvas.ontouchleave = pointerCancel
	canvas.ontouchcancel = pointerCancel

	// Prevent pinch/zoom on iOS 11 and above.
	document.addEventListener('gesturestart', function(event) {
		event.preventDefault()
	}, 0)
	document.addEventListener('gesturechange', function(event) {
		event.preventDefault()
	}, 0)
	document.addEventListener('gestureend', function(event) {
		event.preventDefault()
	}, 0)

	run()
}

function svgToImg(svg, sw, sh, dw, dh) {
	const img = new Image()
	img.src = `data:image/svg+xml;base64,${btoa(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${
		sw} ${sh}" width="${dw}" height="${dh}">${svg}</svg>`)}`
	return img
}

// Packing algorithm from:
// http://www.blackpawn.com/texts/lightmaps/default.html
function atlasInsert(node, w, h) {
	if (node.l) {
		// Try to insert image into left and then into right node.
		return atlasInsert(node.l, w, h) || atlasInsert(node.r, w, h)
	}
	if (node.img) {
		// Node already has an image.
		return
	}
	const rc = node.rc,
		rw = rc.r - rc.l,
		rh = rc.b - rc.t
	if (rw < w || rh < h) {
		// Node is too small.
		return
	}
	if (rw == w && rh == h) {
		// Node fits exactly.
		return node
	}
	// Put image into node and split the remaining space into two
	// new nodes.
	node.l = {}
	node.r = {}
	if (rw - w > rh - h) {
		// +-------+---+
		// | image |   |
		// +-------+   |
		// |       | l |
		// |   r   |   |
		// |       |   |
		// +-------+---+
		node.l.rc = {
			l: rc.l + w,
			t: rc.t,
			r: rc.r,
			b: rc.b
		}
		node.r.rc = {
			l: rc.l,
			t: rc.t + h,
			r: rc.l + w,
			b: rc.b,
		}
	} else {
		// +-------+---+
		// | image | l |
		// +-------+---+
		// |           |
		// |     r     |
		// |           |
		// +-----------+
		node.l.rc = {
			l: rc.l + w,
			t: rc.t,
			r: rc.r,
			b: rc.t + h,
		}
		node.r.rc = {
			l: rc.l,
			t: rc.t + h,
			r: rc.r,
			b: rc.b,
		}
	}
	// Fit rectangle to image.
	node.rc.r = rc.l + w - 1
	node.rc.b = rc.t + h - 1
	return node
}

function createAtlas(sources) {
	const atlasSize = 1024,
		svgSize = 100,
		tileSize = 128,
		scale = tileSize / svgSize,
		border = 1,
		uvPixel = 1 / atlasSize,
		pad = (border + 2) * uvPixel,
		nodes = {rc: {l: 0, t: 0, r: atlasSize, b: atlasSize}},
		coords = [],
		canvas = document.createElement('canvas'),
		ctx = canvas.getContext('2d'),
		len = sources.length
	canvas.width = canvas.height = atlasSize
	canvas.pending = len
	for (let i = 0; i < len; ++i) {
		const src = sources[i],
			fm = (src.split('<')[0].trim() + ';').split(';'),
			size = fm[0].split('x'),
			sw = size[0] || svgSize,
			sh = size[1] || svgSize,
			dw = sw * scale | 0,
			dh = sh * scale | 0,
			node = atlasInsert(nodes, dw + border * 2, dh + border * 2)
		if (!node) {
			return
		}
		const rc = node.rc,
			l = rc.l * uvPixel,
			t = rc.t * uvPixel,
			r = l + dw * uvPixel,
			b = t + dh * uvPixel
		// A--C
		// | /|
		// |/ |
		// B--D
		coords.push(
			l + pad, t + pad,
			l + pad, b - pad,
			r - pad, t + pad,
			r - pad, b - pad,
		)
		spriteSizes.push([dw / tileSize, dh / tileSize])
		node.img = svgToImg(src, sw, sh, dw, dh).onload = function() {
			const angle = fm[1] * Math.PI / 180,
				x = node.rc.l + border,
				y = node.rc.t + border,
				w2 = dw >> 1,
				h2 = dh >> 1
			if (angle > 0) {
				ctx.save()
				ctx.translate(x + w2, y + h2)
				ctx.rotate(angle)
				ctx.drawImage(this, -w2, -h2)
				ctx.restore()
			} else {
				ctx.drawImage(this, x, y)
			}
			--canvas.pending
		}
	}
	return {
		canvas: canvas,
		coords: coords
	}
}

function waitForAtlas(atlas) {
	if (atlas.canvas.pending > 0) {
		setTimeout(function() {
			waitForAtlas(atlas)
		}, 100)
	} else {
		init(atlas)
	}
}

function random() {
	// From: http://indiegamr.com/generate-repeatable-random-numbers-in-js/
	return (seed = (seed * 9301 + 49297) % 233280) / 233280
}

window.onload = function() {
	const sources = [],
		gs = document.getElementsByTagName('g')
	for (let i = 0, l = gs.length; i < l; ++i) {
		sources.push(gs[i].innerHTML)
	}
	waitForAtlas(createAtlas(sources))
}

// Matrix functions below from: https://github.com/toji/gl-matrix

function invert(out, a) {
	const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
		a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
		a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
		a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15],
		b00 = a00 * a11 - a01 * a10,
		b01 = a00 * a12 - a02 * a10,
		b02 = a00 * a13 - a03 * a10,
		b03 = a01 * a12 - a02 * a11,
		b04 = a01 * a13 - a03 * a11,
		b05 = a02 * a13 - a03 * a12,
		b06 = a20 * a31 - a21 * a30,
		b07 = a20 * a32 - a22 * a30,
		b08 = a20 * a33 - a23 * a30,
		b09 = a21 * a32 - a22 * a31,
		b10 = a21 * a33 - a23 * a31,
		b11 = a22 * a33 - a23 * a32

	// Calculate the determinant.
	let d = b00 * b11 -
		b01 * b10 +
		b02 * b09 +
		b03 * b08 -
		b04 * b07 +
		b05 * b06

	if (!d) {
		return
	}

	d = 1 / d

	out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * d
	out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * d
	out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * d
	out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * d
	out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * d
	out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * d
	out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * d
	out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * d
	out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * d
	out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * d
	out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * d
	out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * d
	out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * d
	out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * d
	out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * d
	out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * d
}

function multiply(out, a, b) {
	let a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
		a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
		a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
		a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15]

	// Cache only the current line of the second matrix.
	let b0  = b[0], b1 = b[1], b2 = b[2], b3 = b[3]
	out[0] = b0*a00 + b1*a10 + b2*a20 + b3*a30
	out[1] = b0*a01 + b1*a11 + b2*a21 + b3*a31
	out[2] = b0*a02 + b1*a12 + b2*a22 + b3*a32
	out[3] = b0*a03 + b1*a13 + b2*a23 + b3*a33

	b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7]
	out[4] = b0*a00 + b1*a10 + b2*a20 + b3*a30
	out[5] = b0*a01 + b1*a11 + b2*a21 + b3*a31
	out[6] = b0*a02 + b1*a12 + b2*a22 + b3*a32
	out[7] = b0*a03 + b1*a13 + b2*a23 + b3*a33

	b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11]
	out[8] = b0*a00 + b1*a10 + b2*a20 + b3*a30
	out[9] = b0*a01 + b1*a11 + b2*a21 + b3*a31
	out[10] = b0*a02 + b1*a12 + b2*a22 + b3*a32
	out[11] = b0*a03 + b1*a13 + b2*a23 + b3*a33

	b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15]
	out[12] = b0*a00 + b1*a10 + b2*a20 + b3*a30
	out[13] = b0*a01 + b1*a11 + b2*a21 + b3*a31
	out[14] = b0*a02 + b1*a12 + b2*a22 + b3*a32
	out[15] = b0*a03 + b1*a13 + b2*a23 + b3*a33
}

function rotate(out, a, rad, x, y, z) {
	let len = Math.sqrt(x * x + y * y + z * z),
		s, c, t,
		a00, a01, a02, a03,
		a10, a11, a12, a13,
		a20, a21, a22, a23,
		b00, b01, b02,
		b10, b11, b12,
		b20, b21, b22

	if (len < .000001) {
		return
	}

	len = 1 / len
	x *= len
	y *= len
	z *= len

	s = Math.sin(rad)
	c = Math.cos(rad)
	t = 1 - c

	a00 = a[0]; a01 = a[1]; a02 = a[2]; a03 = a[3]
	a10 = a[4]; a11 = a[5]; a12 = a[6]; a13 = a[7]
	a20 = a[8]; a21 = a[9]; a22 = a[10]; a23 = a[11]

	// Construct the elements of the rotation matrix.
	b00 = x * x * t + c; b01 = y * x * t + z * s; b02 = z * x * t - y * s
	b10 = x * y * t - z * s; b11 = y * y * t + c; b12 = z * y * t + x * s
	b20 = x * z * t + y * s; b21 = y * z * t - x * s; b22 = z * z * t + c

	// Perform rotation-specific matrix multiplication.
	out[0] = a00 * b00 + a10 * b01 + a20 * b02
	out[1] = a01 * b00 + a11 * b01 + a21 * b02
	out[2] = a02 * b00 + a12 * b01 + a22 * b02
	out[3] = a03 * b00 + a13 * b01 + a23 * b02
	out[4] = a00 * b10 + a10 * b11 + a20 * b12
	out[5] = a01 * b10 + a11 * b11 + a21 * b12
	out[6] = a02 * b10 + a12 * b11 + a22 * b12
	out[7] = a03 * b10 + a13 * b11 + a23 * b12
	out[8] = a00 * b20 + a10 * b21 + a20 * b22
	out[9] = a01 * b20 + a11 * b21 + a21 * b22
	out[10] = a02 * b20 + a12 * b21 + a22 * b22
	out[11] = a03 * b20 + a13 * b21 + a23 * b22

	if (a !== out) {
		// If the source and destination differ, copy the unchanged last row.
		out[12] = a[12]
		out[13] = a[13]
		out[14] = a[14]
		out[15] = a[15]
	}
}

function scale(out, a, x, y, z) {
	out[0] = a[0] * x
	out[1] = a[1] * x
	out[2] = a[2] * x
	out[3] = a[3] * x
	out[4] = a[4] * y
	out[5] = a[5] * y
	out[6] = a[6] * y
	out[7] = a[7] * y
	out[8] = a[8] * z
	out[9] = a[9] * z
	out[10] = a[10] * z
	out[11] = a[11] * z
	out[12] = a[12]
	out[13] = a[13]
	out[14] = a[14]
	out[15] = a[15]
}

function translate(out, a, x, y, z) {
	if (a === out) {
		out[12] = a[0] * x + a[4] * y + a[8] * z + a[12]
		out[13] = a[1] * x + a[5] * y + a[9] * z + a[13]
		out[14] = a[2] * x + a[6] * y + a[10] * z + a[14]
		out[15] = a[3] * x + a[7] * y + a[11] * z + a[15]
	} else {
		let a00, a01, a02, a03,
			a10, a11, a12, a13,
			a20, a21, a22, a23

		a00 = a[0]; a01 = a[1]; a02 = a[2]; a03 = a[3]
		a10 = a[4]; a11 = a[5]; a12 = a[6]; a13 = a[7]
		a20 = a[8]; a21 = a[9]; a22 = a[10]; a23 = a[11]

		out[0] = a00; out[1] = a01; out[2] = a02; out[3] = a03
		out[4] = a10; out[5] = a11; out[6] = a12; out[7] = a13
		out[8] = a20; out[9] = a21; out[10] = a22; out[11] = a23

		out[12] = a00 * x + a10 * y + a20 * z + a[12]
		out[13] = a01 * x + a11 * y + a21 * z + a[13]
		out[14] = a02 * x + a12 * y + a22 * z + a[14]
		out[15] = a03 * x + a13 * y + a23 * z + a[15]
	}
}

function setPerspective(out, fov, aspect, near, far) {
	const f = 1 / Math.tan(fov), d = near - far
	out[0] = f / aspect
	out[1] = 0
	out[2] = 0
	out[3] = 0
	out[4] = 0
	out[5] = f
	out[6] = 0
	out[7] = 0
	out[8] = 0
	out[9] = 0
	out[10] = (far + near) / d
	out[11] = -1
	out[12] = 0
	out[13] = 0
	out[14] = (2 * far * near) / d
	out[15] = 0
}
