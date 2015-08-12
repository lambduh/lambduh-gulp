var gutil = require('gulp-util');
var zip = require('gulp-zip');
var del = require('del');
var install = require('gulp-install');
var runSequence = require('run-sequence');
var AWS = require('aws-sdk');
var rename = require("gulp-rename");
var fs = require('fs');

module.exports = function(gulp, opts) {
  if (!gulp) {
    gulp = require('gulp');
    runSequence.use(gulp);
  }

  if(!opts){
    opts = {};
  }

  var packageFile = opts.packageFile || 'package.json';

  gulp.task('clean', function(cb) {
    del(['./dist', './dist.zip'], cb);
  });

  gulp.task('js', function() {
    var config = {};

    try {
      config = require(process.cwd() + "/lambda-config.js");
    } catch(err) {
    }

    var file = config.Handler ? config.Handler.split('.')[0] : 'index';

    return gulp.src(file + '.js')
      .pipe(gulp.dest('dist/'));
  });

  gulp.task('bin', function() {
    return gulp.src('./bin/*')
      .pipe(gulp.dest('dist/'));
  });

  gulp.task('node-mods', function() {
    return gulp.src('./' + packageFile)
      .pipe(rename('package.json'))
      .pipe(gulp.dest('dist/'))
      .pipe(install({production: true, ignoreScripts: opts.ignoreScripts}));
  });

  gulp.task('zip', function() {
    return gulp.src(['dist/**/*', '!dist/' + packageFile])
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
    try {
      var config = require(process.cwd() + "/lambda-config.js");
    } catch(err) {
      gutil.log("lambduh-gulp upload requires a ./lambda-config.js file to return a js object");
      throw err;
    }

    AWS.config.region = config.Region;
    var lambda = new AWS.Lambda();

    var params = {
      FunctionName: config.FunctionName,
      Description: config.Description,
      Handler: config.Handler,
      Role: config.Role,
      Runtime: config.Runtime,
      MemorySize: config.MemorySize,
      Timeout: config.Timeout
    };

    return fs.readFile('./dist.zip', function(err, zip) {
      params.Code = { ZipFile: zip };
      lambda.createFunction(params, function(err, data) {
        if (err && err.statusCode == 409) {//function already exists
          console.log("Function already exists, updating....");
          lambda.updateFunctionConfiguration({
            FunctionName: params.FunctionName,
            Description: params.Description,
            Handler: params.Handler,
            MemorySize: params.MemorySize,
            Role: params.Role,
            Timeout: params.Timeout
          }, function(err, data){
            if(err) {
              var warning = 'Fail while Updating Function Configuration';
              gutil.log(warning);
              //TODO: think about trying to update the code even if the config fails
              callback(err);
            } else {
              console.log("Successful function configuration update.");
              lambda.updateFunctionCode({
                FunctionName: params.FunctionName,
                ZipFile: params.Code.ZipFile
              }, function(err, data) {
                if(err) {
                  var warning = 'Fail while Updating Function Code';
                  gutil.log(warning);
                  callback(err);
                } else {
                  console.log("Successful function upload");
                  callback();
                }
              });
            }
          });
        } else if(err) {
          var warning = 'Fail while Creating Lambda Function';
          gutil.log(warning);
          callback(err);
        } else {
          console.log('Successfully created new lambda function');
          callback();
        }
      });
    });
  });

  gulp.task('zipload', function(callback) {
    return runSequence(
      ['lambda-zip'],
      ['upload'],
      callback
    );
  });
};

