import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedFHELaunchPrice = await deploy("FHELaunchPrice", {
    from: deployer,
    log: true,
  });

  console.log(`FHELaunchPrice contract: `, deployedFHELaunchPrice.address);
};
export default func;
func.id = "deploy_FHELaunchPrice"; // id required to prevent reexecution
func.tags = ["FHELaunchPrice"];
