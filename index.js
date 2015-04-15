var gutil = require('gulp-util');
var zip = require('gulp-zip');
var del = require('del');
var install = require('gulp-install');
var runSequence = require('run-sequence');
var AWS = require('aws-sdk');
var fs = require('fs');

module.exports = function(gulp) {
  if (!gulp) {
    gulp = require('gulp');
  }

  gulp.task('clean', function(cb) {
    del(['./dist', './dist.zip'], cb);
  });

  gulp.task('js', function() {
    return gulp.src('index.js')
      .pipe(gulp.dest('dist/'));
  });

  gulp.task('bin', function() {
    return gulp.src('./bin/*')
      .pipe(gulp.dest('dist/'));
  });

  gulp.task('node-mods', function() {
    return gulp.src('./package.json')
      .pipe(gulp.dest('dist/'))
      .pipe(install({production: true}));
  });

  gulp.task('zip', function() {
    return gulp.src(['dist/**/*', '!dist/package.json'])
      .pipe(zip('dist.zip'))
      .pipe(gulp.dest('./'));
  });

  gulp.task('lambda-zip', function(callback) {
    return runSequence(
      ['clean'],
      ['js', 'bin', 'node-mods'],
      ['zip'],
      callback
    );
  });

  gulp.task('upload', function(callback) {
    var config = require("./lambda-config.js");

    if (!config) {
      gutil.log("lambduh-gulp upload requires a ./lambda-config.js file to return a js object");
    } else {
      AWS.config.region = config.region;
      var lambda = new AWS.Lambda();

      var params = {
        FunctionName: config.functionName,
        Handler: config.handler,
        Mode: "event",
        Role: config.role,
        Runtime: "nodejs",
        Timeout: config.timeout
      };

      return fs.readFile('./dist.zip', function(err, data) {
        params['FunctionZip'] = data;
        lambda.uploadFunction(params, function(err, data) {
          if (err) {
            var warning = 'Package upload failed. '
            warning += 'Check your iam:PassRole permissions.'
            gutil.log(warning);
            callback(err)
          }
          callback()
        });
      });
    }
  });

  gulp.task('zipload', function(callback) {
    return runSequence(
      ['lambda-zip'],
      ['upload'],
      callback
    );
  });
}

