'use strict'

const atlasSize = 1024,
	tileSize = 128,
	horizon = 1000,
	skyColor = [0, .5, .9, 1],
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
	cacheMat = new Float32Array(16)

let gl,
	atlasTexture,
	atlasTextureLoc,
	vertexBuffer,
	vertexLoc,
	uvBuffer,
	uvLoc,
	projMatLoc,
	modelViewMatLoc,
	farLoc,
	skyLoc,
	screenWidth,
	screenHeight

function drawSprite(sprite, modelMat) {
	gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, gl.FALSE, 0, sprite << 5)
	multiply(modelViewMat, viewMat, modelMat)
	gl.uniformMatrix4fv(modelViewMatLoc, gl.FALSE, modelViewMat)
	gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
}

let cameraRotation = 0
function run() {
	requestAnimationFrame(run)
	lookAt(0, 0, cameraRotation)
	cameraRotation += .01

	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

	rotate(groundMat, idMat, -Math.PI / 2, 1, 0, 0)
	for (let y = -2; y <= 2; ++y) {
		for (let x = -2; x <= 2; ++x) {
			translate(cacheMat, groundMat, x * 2, y * 2, 0)
			drawSprite(1, cacheMat)
		}
	}

	translate(cacheMat, spriteMat, Math.sin(cameraRotation), 0, 0)
	drawSprite(0, cacheMat)
}

function lookAt(x, z, a) {
	rotate(viewMat, idMat, a, 0, 1, 0)
	translate(viewMat, viewMat, x + camPos[0], camPos[1], z + camPos[2])
	rotate(viewMat, viewMat, -.9, 1, 0, 0)
	invert(viewMat, viewMat)

	rotate(spriteMat, idMat, a, 0, 1, 0)
	rotate(spriteMat, spriteMat, -.9, 1, 0, 0)
	translate(spriteMat, spriteMat, 0, 1, 0)
}

function resize() {
	gl.canvas.width = screenWidth = gl.canvas.clientWidth
	gl.canvas.height = screenHeight = gl.canvas.clientHeight
	gl.viewport(0, 0, screenWidth, screenHeight)
	setPerspective(projMat, Math.PI * .125, screenWidth / screenHeight, .1,
		horizon)
	gl.uniformMatrix4fv(projMatLoc, gl.FALSE, projMat)
	lookAt(0, 0)
}

function compileShader(type, src) {
	const id = gl.createShader(type)
	gl.shaderSource(id, src)
	gl.compileShader(id)
	if (!gl.getShaderParameter(id, gl.COMPILE_STATUS)) {
		throw gl.getShaderInfoLog(id)
	}
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

function calculateSpriteRects() {
	const coords = [],
		f = 1 / atlasSize,
		n = .5 * f
	for (let y = 0; y < atlasSize; y += tileSize) {
		for (let x = 0; x < atlasSize; x += tileSize) {
			const l = x * f,
				t = y * f,
				r = l + tileSize * f,
				b = t + tileSize * f
			/* TRIANGLE_STRIP order:
			 *   A--C   A: x, y
			 *   | /|   B: x, y
			 *   |/ |   C: x, y
			 *   B--D   D: x, y */
			coords.push(
				l + n, t + n,
				l + n, b - n,
				r - n, t + n,
				r - n, b - n,
			)
		}
	}
	return coords
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
	gl.enable(gl.BLEND)
	gl.enable(gl.CULL_FACE)
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
	gl.clearColor(skyColor[0], skyColor[1], skyColor[3], skyColor[4])

	atlasTexture = createTexture(atlas)
	vertexBuffer = createBuffer([
		-1, 1, 0, // left top
		-1, -1, 0, // left bottom
		1, 1, 0, // right top
		1, -1, 0, // right bottom
	])
	uvBuffer = createBuffer(calculateSpriteRects())

	const program = createProgram(
		document.getElementById('VertexShader').textContent,
		document.getElementById('FragmentShader').textContent)
	gl.enableVertexAttribArray(
		vertexLoc = gl.getAttribLocation(program, "vertex"))
	gl.enableVertexAttribArray(
		uvLoc = gl.getAttribLocation(program, "uv"))
	projMatLoc = gl.getUniformLocation(program, 'projMat')
	modelViewMatLoc = gl.getUniformLocation(program, 'modelViewMat')
	atlasTextureLoc = gl.getUniformLocation(program, 'texture')
	farLoc = gl.getUniformLocation(program, 'far')
	skyLoc = gl.getUniformLocation(program, 'sky')
	gl.useProgram(program)

	gl.activeTexture(gl.TEXTURE0)
	gl.bindTexture(gl.TEXTURE_2D, atlasTexture)
	gl.uniform1i(atlasTextureLoc, 0)

	gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
	gl.vertexAttribPointer(vertexLoc, 3, gl.FLOAT, gl.FALSE, 0, 0)
	gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer)

	gl.uniform4fv(skyLoc, skyColor)
	gl.uniform1f(farLoc, horizon)

	window.onresize = resize
	resize()

	run()
}

function svgToImg(svg, size) {
	const img = new Image()
	img.src = `data:image/svg+xml;base64,${btoa(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">${svg}</svg>`)}`
	return img
}

function createAtlas() {
	const sprites = ['A', 'B'],
		canvas = document.createElement('canvas'),
		ctx = canvas.getContext('2d')
	canvas.width = canvas.height = atlasSize
	canvas.pending = sprites.length
	let x = 0, y = 0
	sprites.forEach(name => {
		const xx = x, yy = y
		svgToImg(document.getElementById(name).innerHTML,
				tileSize).onload = function() {
			ctx.drawImage(this, xx, yy)
			--canvas.pending
		}
		x += tileSize
		if (x >= atlasSize) {
			x = 0
			y += tileSize
		}
	})
	return canvas
}

function waitForAtlas(atlas) {
	if (atlas.pending > 0) {
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
