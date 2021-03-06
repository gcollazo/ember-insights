import { it } from 'ember-mocha';
import runtime from 'ember-insights/runtime';


describe('Engine Start/Stop', function() {

  it('tries to start w/ out #track', function() {
    function attempt() {
      var addon = { configs: [] };
      runtime(addon).configure().start();
    }
    expect(attempt).to.throw(Error, "can't start without specified mappings");
  });

  it('tries to start', function() {
    function attempt() {
      var addon = { configs: [] };
      runtime(addon).configure().start('undefined');
    }
    expect(attempt).to.throw(Error, "can't find settings for 'undefined' environment");
  });

  it('starts runtime by default', function() {
    var addon = { configs: [] };
    runtime(addon).configure().track().start();
    expect(addon.isActivated).to.be.ok();
  });

  it('starts runtime', function() {
    var addon = { configs: [] };
    runtime(addon).configure('test').track().start('test');
    expect(addon.isActivated).to.be.ok();
  });

  it('stops runtime', function() {
    var addon = { configs: [] };
    runtime(addon).configure('test').stop();
    expect(addon.isActivated).to.not.be.ok();
  });

});
