
export function generateIndexHtml(frontendModules: string): string {
  return `<!DOCTYPE html>
<html>
  <head>
  ${frontendModules}
  <meta charset="utf-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1">
  <title>Sign in | Mbed Studio</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Lato:400">
  <script src="./bundle.js"></script>
  </head>
  <style>
  body, html {
    height: 100%;
    background-color: #0091BD;
    background-image: url("https://s3.us-west-2.amazonaws.com/mbed-auth0-assets/MbedCityTile.png");
    background-attachment: fixed;
    font-size: 10px;
    font-weight: 400;
    font-family: Lato, sans-serif;
    line-height: 1.4;
  }

  .login-container {
    font-size: 1.4rem;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-group:last-child {
    margin-bottom: 2.5rem;
  }

  .form-control {
    padding: 6px;
    border-radius: 2px;
  }

  .form-control:focus {
    background: #fafafa;
    outline: none !important;
    box-shadow: none;
    border-color: #b3b3b3;
  }

  .login-container {
    position: relative;
    height: 100%;
  }

  .login-box {
    padding: 15px;
    background-color: #fff;
    border-top: 1px solid #e9e9e9;
    margin-top: 30px;
    margin-bottom: 30px;
  }

  .login-header {
    text-align: center;
    margin-bottom: 10px;
  }

  .login-header img {
    width: 100px;
  }

  .tab-content {
    padding: 15px;
    border: 1px solid #ddd;
    border-top: 0;
  }

  .help-link {
    outline: none;
    text-decoration: none;
    font-size: 1.2rem;
  }

  #login-error-message {
    display: none;
  }

  #signup-form p {
    font-size: 12px;
  }

  input.ui-autocomplete-input {
    display: block;
  }

  button.btn-primary {
    font-size: 1.6rem;
    border: none;
    border-radius: 0;
    background-color: #FFC700;
    color: #333E48;
  }

  button.btn-primary:hover {
    background-color: #fb9f2a;
    color: #333E48;
  }
  </style>
  <body>
  <div class="login-container" id="login-container">
    <div class="col-xs-12 col-sm-4 col-sm-offset-4 login-box">
      <div class="login-header">
        <img src="https://s3.us-west-2.amazonaws.com/mbed-auth0-assets/ArmLogoVertical.svg"/>
      </div>

      <ul id="tabs" class="nav nav-tabs nav-justified">
        <li class="active">
          <a id="login-tab" data-toggle="tab" href="#login">Log in</a>
        </li>
      </ul>
      <div class="tab-content">
        <div id="login" class="tab-pane fade in active">
          <div id="login-success-message" class="alert alert-success" style="display: none;"></div>
          <div id="login-error-message" class="alert alert-danger" style="display: none;"></div>
          <form id="login-form" method="post">
            <div class="form-group">
              <label for="login-identifier">
                Email or username
              </label>
              <input
                type="text"
                class="form-control"
                id="login-identifier"
                placeholder="Enter your email or username"
              >
              <a class="help-link" href="https://mbed-developer-qa.test.mbed.com/account/forgotten_username/" tabindex="-1">
                Forgotten your username?
              </a>
            </div>
            <div class="form-group">
              <label for="login-password">Password</label>
              <input
                type="password"
                class="form-control"
                id="login-password"
                placeholder="Enter your password"
              >
              <a class="help-link" href="https://mbed-developer-qa.test.mbed.com/account/reset_password/" tabindex="-1">
                Forgotten your password?
              </a>
            </div>
            <button type="submit" id="login-submit" class="btn btn-primary btn-block">Log In</button>
          </form>
        </div>
      </div>
    </div>
  </div>

  <script>if (typeof module === 'object') {window.module = module; module = undefined;}</script>
  <script src="https://code.jquery.com/jquery-3.3.1.min.js"></script>
  <script src="https://cdn.auth0.com/js/auth0/9.4.2/auth0.min.js"></script>
  <script src="https://cdn.auth0.com/js/polyfills/1.0/object-assign.min.js"></script>
  <script src="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/js/bootstrap.min.js"></script>
  <script>if (window.module) module = window.module;</script>
  <script>
    window.addEventListener('load', function () {
      const config = {
        auth0Domain: "",
        clientID: "",
        callbackURL: "",
        auth0Tenant: ""
      }
      const params = Object.assign({
        domain: config.auth0Domain,
        clientID: config.clientID,
        redirectUri: config.callbackURL,
        responseType: 'code',
        overrides: {
          __tenant: config.auth0Tenant,
          __token_issuer: config.auth0Domain
        }
      }, config.internalOptions);
      const webAuth = new auth0.WebAuth(params);

      // Notification events
      function displayNotificationMessage(element, msg) {
        const notificationElement = $(element);
        notificationElement.empty();
        notificationElement.append(msg);
        notificationElement.show();
        $("html, body").animate({
          scrollTop: (notificationElement.offset().top)
        }, 500);
      }

      // const connection = "Username-Password-Authentication";
      // const identifier = $("#login-identifier").val();
      // const password = $("#login-password").val();

      // webAuth.login({
      //   realm: connection,
      //   username: identifier,
      //   password: password
      // }, function (error) {
      //   if (error) {
      //     displayNotificationMessage("#login-error-message", error.description);
      //     $("#login-submit").removeAttr('disabled');
      //   }
      // });
    });
  </script>
  </body>
</html>`
}
