'use strict'

const horizon = 100,
	skyColor = [0, .9, .5, 1],
	camPos = [0, 16, 12],
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
	spriteSizes = [],
	pointerSpot = [0, 0, 0],
	pointersX = [],
	pointersY = []

let gl,
	spriteModelBuffer,
	spriteUvBuffer,
	groundModelBuffer,
	groundUvBuffer,
	groundLength,
	vertexLoc,
	uvLoc,
	projMatLoc,
	modelViewMatLoc,
	screenWidth,
	screenHeight,
	camX, camA,
	camY, camB,
	camZ, camC,
	lookX,
	lookZ,
	pointers

function drawSprite(n, x, y, z) {
	spriteMat[12] = x
	spriteMat[13] = y
	spriteMat[14] = z
	const size = spriteSizes[n]
	scale(cacheMat, spriteMat, size[0], size[1], 1)
	gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, gl.FALSE, 0, n << 5)
	multiply(modelViewMat, viewMat, cacheMat)
	gl.uniformMatrix4fv(modelViewMatLoc, gl.FALSE, modelViewMat)
	gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
}

function compareDist(a, b) {
	return b.dist - a.dist
}

function moveToTarget(e, tx, tz, step) {
	const dx = tx - e.x,
		dz = tz - e.z,
		d = dx*dx + dz*dz
	if (d == 0) return
	if (d < step * step) {
		e.x = tx
		e.z = tz
	} else {
		const f = step / Math.sqrt(d)
		e.x += dx * f
		e.z += dz * f
	}
}

const objects = [
	{sprite: 1, x: 0, y: 0, z: 0, tx: 0, tz: 0, c: {x: 0, z: 0}, update: function() {
		moveToTarget(this, this.tx, this.tz, .1)
		const dx = lookX - this.x,
			dz = lookZ - this.z,
			d = dx*dx + dz*dz
		if (d > 0) {
			const dd = Math.sqrt(d) - 2
			moveToTarget(this.c, this.tx, this.tz, dd > .01 ? dd : .05)
			lookAt(this.c.x, this.c.z, .2)
		}
	}},
	{sprite: 0, x: 0, y: 0, z: -2, t: 0, update: function() {
		this.t += .01
		this.x = Math.sin(this.t) * 3
	}},
	{sprite: 0, x: 4, y: 0, z: 4, update: function() {}},
	{sprite: 1, x: 3.5, y: 0, z: 3.5, update: function() {}},
	{sprite: 4, x: -2, y: 0, z: 2, update: function() {}},
	{sprite: 4, x: 4, y: 0, z: 3, update: function() {}},
],
	player = objects[0]
function run() {
	requestAnimationFrame(run)

	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

	// Draw ground.
	gl.bindBuffer(gl.ARRAY_BUFFER, groundModelBuffer)
	gl.vertexAttribPointer(vertexLoc, 3, gl.FLOAT, gl.FALSE, 0, 0)
	gl.bindBuffer(gl.ARRAY_BUFFER, groundUvBuffer)
	gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, gl.FALSE, 0, 0)

	multiply(modelViewMat, viewMat, idMat)
	gl.uniformMatrix4fv(modelViewMatLoc, gl.FALSE, modelViewMat)
	gl.drawArrays(gl.TRIANGLES, 0, groundLength)

	// Draw sprites.
	gl.bindBuffer(gl.ARRAY_BUFFER, spriteModelBuffer)
	gl.vertexAttribPointer(vertexLoc, 3, gl.FLOAT, gl.FALSE, 0, 0)
	gl.bindBuffer(gl.ARRAY_BUFFER, spriteUvBuffer)

	objects.forEach(o => {
		o.update()
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
		drawSprite(o.sprite, o.x, o.y, o.z)
	})
}

function rayGround(out, lx, ly, lz, dx, dy, dz) {
	const denom = -1*dy
	if (denom > .0001) {
		const t = -1*-ly / denom
		out[0] = lx + dx*t
		out[1] = ly + dy*t
		out[2] = lz + dz*t
		return t >= 0
	}
	return false
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
		pointersX[i] = (2 * pointersX[i]) / screenWidth - 1
		pointersY[i] = 1 - (2 * pointersY[i]) / screenHeight
	}

	event.stopPropagation()
}

function pointerCancel(event) {
	setPointer(event, false)
}

function pointerUp(event) {
	// Because onMouseUp() will still fire after onMouseOut().
	if (pointers < 1) {
		return
	}
	setPointer(event, false)
}

function pointerMove(event) {
	setPointer(event, pointers)
	if (pointers > 0) {
		moveToPointer()
	}
}

function pointerDown(event) {
	setPointer(event, true)
	moveToPointer()
}

function lookAt(x, z, a) {
	lookX = x
	lookZ = z

	translate(viewMat, idMat, x, 0, z)
	rotate(viewMat, viewMat, a, 0, 1, 0)
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
	gl.canvas.width = screenWidth = gl.canvas.clientWidth
	gl.canvas.height = screenHeight = gl.canvas.clientHeight
	gl.viewport(0, 0, screenWidth, screenHeight)
	setPerspective(projMat, Math.PI * .125, screenWidth / screenHeight, .1,
		horizon)
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

function createGroundModel() {
	const vertices = [],
		radius = 4
	for (let y = -radius; y <= radius; ++y) {
		for (let x = -radius; x <= radius; ++x) {
			const xx = x * 2, yy = y * 2
			vertices.push(
				// A--B
				// | /
				// |/
				// C
				xx - 1, 0, yy + 1,
				xx + 1, 0, yy + 1,
				xx - 1, 0, yy - 1,
				//    E
				//   /|
				//  / |
				// D--F
				xx - 1, 0, yy - 1,
				xx + 1, 0, yy + 1,
				xx + 1, 0, yy - 1,
			)
		}
	}
	return vertices
}

function createGroundUv(l, uvCoords) {
	const groundUvs = []
	for (let i = 0; i < l; i += 4) {
		const offset = (2 + ((i >> 2) % 2)) << 3,
			left = uvCoords[offset],
			top = uvCoords[offset + 1],
			right = uvCoords[offset + 6],
			bottom = uvCoords[offset + 7]
		groundUvs.push(
			// A--B
			// | /
			// |/
			// C
			left, top,
			right, top,
			left, bottom,
			//    E
			//   /|
			//  / |
			// D--F
			left, bottom,
			right, top,
			right, bottom,
		)
	}
	return groundUvs
}

function createBuffer(data) {
	const id = gl.createBuffer()
	gl.bindBuffer(gl.ARRAY_BUFFER, id)
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW)
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

function init(atlas) {
	gl = document.getElementById('Canvas').getContext('webgl')
	gl.enable(gl.DEPTH_TEST)
	gl.enable(gl.CULL_FACE)
	gl.enable(gl.BLEND)
	gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
	gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
	gl.clearColor(skyColor[0], skyColor[1], skyColor[2], skyColor[3])

	const atlasTexture = createTexture(atlas.canvas),
		groundVertices = createGroundModel()
	groundLength = groundVertices.length / 3
	groundModelBuffer = createBuffer(groundVertices)
	groundUvBuffer = createBuffer(createGroundUv(groundLength, atlas.coords))

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
	lookAt(0, 0, .2)

	document.onmousedown = pointerDown
	document.onmousemove = pointerMove
	document.onmouseup = pointerUp
	document.onmouseout = pointerCancel

	if ('ontouchstart' in document) {
		document.ontouchstart = pointerDown
		document.ontouchmove = pointerMove
		document.ontouchend = pointerUp
		document.ontouchleave = pointerCancel
		document.ontouchcancel = pointerCancel

		// Prevent pinch/zoom on iOS 11.
		document.addEventListener('gesturestart', function(event) {
			event.preventDefault()
		}, false)
		document.addEventListener('gesturechange', function(event) {
			event.preventDefault()
		}, false)
		document.addEventListener('gestureend', function(event) {
			event.preventDefault()
		}, false)
	}

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
		return atlasInsert(node.l, w, h) || atlasInsert(node.r, w, h)
	}
	if (node.img) {
		return
	}
	const rc = node.rc,
		rw = rc.r - rc.l,
		rh = rc.b - rc.t
	if (rw < w || rh < h) {
		return
	}
	if (rw == w && rh == h) {
		return node
	}
	node.l = {}
	node.r = {}
	if (rw - w > rh - h) {
		node.l.rc = {
			l: rc.l,
			t: rc.t,
			r: rc.l + w - 1,
			b: rc.b,
		}
		node.r.rc = {
			l: rc.l + w,
			t: rc.t,
			r: rc.r,
			b: rc.b,
		}
	} else {
		node.l.rc = {
			l: rc.l,
			t: rc.t,
			r: rc.r,
			b: rc.t + h - 1,
		}
		node.r.rc = {
			l: rc.l,
			t: rc.t + h,
			r: rc.r,
			b: rc.b,
		}
	}
	return node.l
}

function createAtlas() {
	const atlasSize = 1024,
		svgSize = 100,
		tileSize = 128,
		scale = tileSize / svgSize,
		border = 1,
		normalizedAtlasSize = 1 / atlasSize,
		pad = (border + .5) * normalizedAtlasSize,
		nodes = {rc: {l: 0, t: 0, r: atlasSize, b: atlasSize}},
		coords = [],
		sprites = document.getElementsByTagName('g'),
		canvas = document.createElement('canvas'),
		ctx = canvas.getContext('2d')
	canvas.width = canvas.height = atlasSize
	canvas.pending = sprites.length
	for (let i = 0, l = canvas.pending; i < l; ++i) {
		const e = sprites[i],
			size = e.textContent.trim().split('x'),
			sw = size[0] || svgSize,
			sh = size[1] || svgSize,
			dw = sw * scale | 0,
			dh = sh * scale | 0,
			node = atlasInsert(nodes, dw + border * 2, dh + border * 2)
		if (!node) {
			return
		}
		const rc = node.rc,
			l = rc.l * normalizedAtlasSize,
			t = rc.t * normalizedAtlasSize,
			r = l + dw * normalizedAtlasSize,
			b = t + dh * normalizedAtlasSize
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
		node.img = svgToImg(e.innerHTML, sw, sh, dw, dh).onload = function() {
			ctx.drawImage(this, node.rc.l + border, node.rc.t + border)
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

window.onload = function() {
	waitForAtlas(createAtlas())
}
