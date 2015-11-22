var path 	= require('path');
var glob 	= require('glob');
var fs 		= require('fs');
var extend 	= require('util')._extend;
var through = require('through2');
var gulpFilter = require('gulp-filter');

var config 	= require('../config');

module.exports.task = function(gulp, plugins, paths) {
	
	var engine = new plugins.compileLiquid.Liquid.Engine;
	var layouts = {};

	var layoutFilter = gulpFilter([ '**/*-layout.html' ], { restore: true });
	var pageFilter = gulpFilter([ '**/*-page.html' ], { restore: true });

	gulp.src([ paths.app.layouts.src, paths.app.pages.src ])
		

		.pipe(layoutFilter)
		.pipe(through.obj(function (file, enc, cb) {
			var ext = path.extname(file.relative);
			var name = path.basename(file.relative, ext).replace('-layout', '');
			layouts[name] = engine.parse(file.contents);

			this.push(file);
			cb();
		}))
		.pipe(layoutFilter.restore)
		

		.pipe(pageFilter)
		// Frontmatter
		.pipe(plugins.frontMatter())
		// handlebars compilation
		.pipe(plugins.compileLiquid({
			// Context data for each page file
			dataEach: function (context, file) {

				var contextExtended = extend(context, getPageContext(file));
					contextExtended = extend(contextExtended, file.frontMatter);

				return contextExtended;
			}
		}))


		.pipe(through.obj(function (file, enc, cb) {
			var _that = this;
			var name = file.frontMatter.layout || '';

			if (name && layouts[name]) {
				layouts[name]
					.then(function(template) {
						return template.render({
							content: file.contents.toString()
						}); 
					})
					.then(function(result) {
						file.contents = new Buffer(result);
						_that.push(file);
						cb();
					});
			} else {			
				_that.push(file);
				cb();
			}
		}))

		// Handle errors
		.on('error', plugins.util.log)

		// Rename .page.hbs to .html
		.pipe(plugins.rename(function (path) {
			path.basename = path.basename.replace('-page', '');
			path.extname = '.html';
		}))
		
		// Flatten structure
		.pipe(plugins.flatten())

		// Output
		.pipe(gulp.dest(paths.app.pages.dest));
};


/********************************************
*				Utils
*********************************************/

/*
	This function returns context of current page 
	which is root context extended by all contexts untill
	current level context
*/


function getPageContext(file) {

	var context = {};

	var rootDir = path.resolve(config.srcDir);
	var pageDir = path.dirname(file.path);

	var contextPaths = [];

	// Start going up from page directory until root directory
	for (var activeDir = pageDir; activeDir.length >= rootDir.length; activeDir = path.resolve(activeDir, '../') ) {
		contextPaths.push(
			path.resolve(activeDir, '_context.js')
		);
	}

	// Reverse context, so the iteration will start from root level context
	contextPaths.reverse();


	contextPaths.map(function(filePath) {
		if (!fs.existsSync(filePath)) {
			return false;
		}

		var localContext = require(filePath);

		extend(context, localContext);
	});


	return context;
};