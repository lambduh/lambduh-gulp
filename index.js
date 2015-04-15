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
        if (err.statusCode == 409) {//function already exists
          console.log(err);
          lambda.updateFunctionConfiguration(params, function(err, data){
            if(err) {
              var warning = 'Fail while Updating Function Configuration'
              gutil.log(warning);
              //TODO: think about trying to update the code anyway
              callback(err);
            } else {
              console.log("Successful function configuration update.");
              lambda.updateFunctionCode({
                FunctionName: params.FunctionName,
                ZipFile: params.Code.ZipFile
              }, function(err, data) {
                if(err) {
                  var warning = 'Fail while Updating Function Code'
                  gutil.log(warning);
                  callback(err);
                } else {
                  console.log("Successful function upload");
                  callback();
                }
              })
            }
          })
        } else if(err) {
          var warning = 'Fail while Creating Lambda Function'
          gutil.log(warning);
          callback(err)
        } else {
          console.log('Successfully created new lambda function');
          callback()
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
}

